/**
 * UploadConsistencyChecker - 上传状态一致性检查工具类
 * 用于检查和修复上传过程中的状态一致性问题
 */

import { Logger } from './Logger';
import { UploadStatus } from '../types/resume';
import { EventBus } from '../core/EventBus';

interface ConsistencyResult {
  fileId: string;
  isConsistent: boolean;
  issues: Array<{
    type:
      | 'state_mismatch'
      | 'missing_chunks'
      | 'orphaned_chunks'
      | 'progress_mismatch';
    expected?: any;
    actual?: any;
    description: string;
  }>;
  fixed: boolean;
}

/**
 * 上传状态一致性检查工具
 */
export class UploadConsistencyChecker {
  private logger: Logger;
  private eventBus?: EventBus;

  constructor(eventBus?: EventBus) {
    this.logger = new Logger('UploadConsistencyChecker');
    this.eventBus = eventBus;
  }

  /**
   * 检查上传状态一致性
   * @param fileId 文件ID
   * @param resumeData 断点续传数据
   * @param taskStates 任务调度器中的状态
   * @param activeUploads 活动上传集合
   * @param autoFix 是否自动修复问题
   * @returns 一致性检查结果
   */
  public checkConsistency(
    fileId: string,
    resumeData: any,
    taskStates: any,
    activeUploads: Set<string>,
    autoFix = false
  ): ConsistencyResult {
    const result: ConsistencyResult = {
      fileId,
      isConsistent: true,
      issues: [],
      fixed: false,
    };

    if (!resumeData) {
      result.isConsistent = false;
      result.issues.push({
        type: 'missing_chunks',
        description: '找不到断点续传数据',
      });
      return result;
    }

    // 1. 检查活动上传集合与状态是否一致
    this.checkActiveUploadConsistency(
      fileId,
      resumeData,
      activeUploads,
      result
    );

    // 2. 检查任务状态与断点续传状态是否一致
    this.checkTaskStateConsistency(fileId, resumeData, taskStates, result);

    // 3. 检查断点续传数据内部一致性
    this.checkResumeDataConsistency(resumeData, result);

    // 如果发现问题且启用了自动修复
    if (!result.isConsistent && autoFix) {
      this.fixConsistencyIssues(
        fileId,
        resumeData,
        taskStates,
        activeUploads,
        result
      );
      result.fixed = true;
    }

    // 记录检查结果
    if (!result.isConsistent) {
      this.logger.warn(`文件 ${fileId} 状态一致性检查失败`, {
        issues: result.issues,
        fixed: result.fixed,
      });

      // 发送事件通知
      if (this.eventBus) {
        this.eventBus.emit('consistencyCheck:failed', {
          fileId,
          issues: result.issues,
          fixed: result.fixed,
        });
      }
    }

    return result;
  }

  /**
   * 检查活动上传集合与状态一致性
   */
  private checkActiveUploadConsistency(
    fileId: string,
    resumeData: any,
    activeUploads: Set<string>,
    result: ConsistencyResult
  ): void {
    // 检查上传状态与活动上传集合是否一致
    const isActive = activeUploads.has(fileId);
    const shouldBeActive =
      resumeData.status === UploadStatus.UPLOADING ||
      resumeData.status === UploadStatus.PENDING;

    if (isActive !== shouldBeActive) {
      result.isConsistent = false;
      result.issues.push({
        type: 'state_mismatch',
        expected: shouldBeActive ? '活动上传' : '非活动上传',
        actual: isActive ? '活动上传' : '非活动上传',
        description: `上传状态 ${resumeData.status} 与活动上传集合不一致`,
      });
    }
  }

  /**
   * 检查任务状态与断点续传状态一致性
   */
  private checkTaskStateConsistency(
    fileId: string,
    resumeData: any,
    taskStates: any,
    result: ConsistencyResult
  ): void {
    // 检查任务是否存在
    const hasTasks =
      taskStates &&
      taskStates.some(
        (task: any) => task.metadata && task.metadata.fileId === fileId
      );

    const shouldHaveTasks =
      resumeData.status === UploadStatus.UPLOADING ||
      resumeData.status === UploadStatus.PENDING;

    if (
      hasTasks !== shouldHaveTasks &&
      resumeData.status !== UploadStatus.PAUSED
    ) {
      result.isConsistent = false;
      result.issues.push({
        type: 'state_mismatch',
        expected: shouldHaveTasks ? '存在任务' : '不存在任务',
        actual: hasTasks ? '存在任务' : '不存在任务',
        description: `上传状态 ${resumeData.status} 与任务状态不一致`,
      });
    }

    // 检查任务状态
    if (hasTasks) {
      const activeTasks = taskStates.filter(
        (task: any) =>
          task.metadata &&
          task.metadata.fileId === fileId &&
          task.state !== 'cancelled' &&
          task.state !== 'completed'
      );

      if (
        resumeData.status === UploadStatus.PAUSED &&
        activeTasks.some((task: any) => task.state !== 'paused')
      ) {
        result.isConsistent = false;
        result.issues.push({
          type: 'state_mismatch',
          description: '已暂停状态下存在非暂停任务',
        });
      }

      if (
        resumeData.status === UploadStatus.UPLOADING &&
        activeTasks.length === 0
      ) {
        result.isConsistent = false;
        result.issues.push({
          type: 'state_mismatch',
          description: '上传中状态下不存在活动任务',
        });
      }
    }
  }

  /**
   * 检查断点续传数据内部一致性
   */
  private checkResumeDataConsistency(
    resumeData: any,
    result: ConsistencyResult
  ): void {
    // 检查上传进度与已上传分片是否一致
    if (resumeData.uploadedChunks && resumeData.totalChunks) {
      const uploadedCount = resumeData.uploadedChunks.filter(
        (chunk: any) => chunk.status === 'uploaded'
      ).length;

      const expectedProgress =
        resumeData.totalChunks > 0 ? uploadedCount / resumeData.totalChunks : 0;

      // 允许小误差(0.01)
      if (Math.abs(expectedProgress - resumeData.progress) > 0.01) {
        result.isConsistent = false;
        result.issues.push({
          type: 'progress_mismatch',
          expected: expectedProgress,
          actual: resumeData.progress,
          description: '进度值与已上传分片数量不一致',
        });
      }
    }

    // 检查状态是否合理
    // 如果全部分片已上传，但状态不是完成
    if (
      resumeData.uploadedChunks &&
      resumeData.totalChunks &&
      resumeData.uploadedChunks.filter(
        (chunk: any) => chunk.status === 'uploaded'
      ).length === resumeData.totalChunks &&
      resumeData.status !== UploadStatus.COMPLETED
    ) {
      result.isConsistent = false;
      result.issues.push({
        type: 'state_mismatch',
        expected: UploadStatus.COMPLETED,
        actual: resumeData.status,
        description: '所有分片已上传但状态不是"已完成"',
      });
    }
  }

  /**
   * 修复一致性问题
   */
  private fixConsistencyIssues(
    fileId: string,
    resumeData: any,
    taskStates: any,
    activeUploads: Set<string>,
    result: ConsistencyResult
  ): void {
    // 遍历所有问题并尝试修复
    for (const issue of result.issues) {
      switch (issue.type) {
        case 'state_mismatch':
          this.fixStateMismatch(
            fileId,
            resumeData,
            taskStates,
            activeUploads,
            issue
          );
          break;

        case 'progress_mismatch':
          this.fixProgressMismatch(resumeData, issue);
          break;

        // 其他类型问题的修复...
      }
    }
  }

  /**
   * 修复状态不一致问题
   */
  private fixStateMismatch(
    fileId: string,
    resumeData: any,
    taskStates: any,
    activeUploads: Set<string>,
    issue: any
  ): void {
    // 如果全部分片已上传但状态不是完成，修正为完成
    if (issue.description === '所有分片已上传但状态不是"已完成"') {
      resumeData.status = UploadStatus.COMPLETED;
      this.logger.debug(`已修正文件 ${fileId} 的状态为已完成`);
    }

    // 修正活动上传集合
    const shouldBeActive =
      resumeData.status === UploadStatus.UPLOADING ||
      resumeData.status === UploadStatus.PENDING;

    if (shouldBeActive && !activeUploads.has(fileId)) {
      activeUploads.add(fileId);
      this.logger.debug(`已将文件 ${fileId} 添加到活动上传集合`);
    } else if (!shouldBeActive && activeUploads.has(fileId)) {
      activeUploads.delete(fileId);
      this.logger.debug(`已将文件 ${fileId} 从活动上传集合移除`);
    }
  }

  /**
   * 修复进度不一致问题
   */
  private fixProgressMismatch(resumeData: any, issue: any): void {
    // 以实际上传的分片数为准，更新进度值
    if (resumeData.uploadedChunks && resumeData.totalChunks) {
      const uploadedCount = resumeData.uploadedChunks.filter(
        (chunk: any) => chunk.status === 'uploaded'
      ).length;

      resumeData.progress =
        resumeData.totalChunks > 0 ? uploadedCount / resumeData.totalChunks : 0;

      this.logger.debug(
        `已修正进度值从 ${issue.actual} 到 ${resumeData.progress}`
      );
    }
  }
}
