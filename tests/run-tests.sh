#!/bin/bash

# 设置颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${YELLOW}===== fileChunkPro 测试运行脚本 =====${NC}"
echo ""

# 检查是否安装了pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}错误: 未找到pnpm命令. 请确保已安装pnpm.${NC}"
    exit 1
fi

# 检查是否安装了vitest
if ! pnpm list vitest | grep -q "vitest"; then
    echo -e "${YELLOW}正在安装测试依赖...${NC}"
    pnpm install
fi

# 创建测试结果目录
RESULTS_DIR="test-results"
mkdir -p $RESULTS_DIR

# 显示测试统计信息
display_test_stats() {
    local TEST_NAME=$1
    local RESULT_FILE=$2
    
    if [ -f "$RESULT_FILE" ]; then
        local TOTAL=$(grep -o 'Test Files' "$RESULT_FILE" | wc -l)
        local PASSED=$(grep -o 'passed' "$RESULT_FILE" | wc -l)
        local FAILED=$(grep -o 'failed' "$RESULT_FILE" | wc -l)
        local SKIPPED=$(grep -o 'skipped' "$RESULT_FILE" | wc -l)
        
        echo -e "${BLUE}${TEST_NAME} 统计:${NC}"
        echo -e "  总测试数: ${TOTAL}"
        echo -e "  通过: ${GREEN}${PASSED}${NC}"
        
        if [ $FAILED -gt 0 ]; then
            echo -e "  失败: ${RED}${FAILED}${NC}"
        else
            echo -e "  失败: ${FAILED}"
        fi
        
        if [ $SKIPPED -gt 0 ]; then
            echo -e "  跳过: ${YELLOW}${SKIPPED}${NC}"
        else
            echo -e "  跳过: ${SKIPPED}"
        fi
        echo ""
    fi
}

# 运行单元测试
echo -e "${YELLOW}运行单元测试...${NC}"
pnpm test:unit > $RESULTS_DIR/unit.log
UNIT_TEST_RESULT=$?
display_test_stats "单元测试" "$RESULTS_DIR/unit.log"

# 运行插件测试
echo -e "${YELLOW}运行插件测试...${NC}"
pnpm test -- tests/unit/plugins > $RESULTS_DIR/plugins.log
PLUGINS_TEST_RESULT=$?
display_test_stats "插件测试" "$RESULTS_DIR/plugins.log"

# 运行安全测试
echo -e "${YELLOW}运行安全测试...${NC}"
pnpm test -- tests/unit/plugins/SecurityPlugin.test.ts > $RESULTS_DIR/security.log
SECURITY_TEST_RESULT=$?
display_test_stats "安全测试" "$RESULTS_DIR/security.log"

# 运行集成测试
echo -e "${YELLOW}运行集成测试...${NC}"
pnpm test:integration > $RESULTS_DIR/integration.log
INTEGRATION_TEST_RESULT=$?
display_test_stats "集成测试" "$RESULTS_DIR/integration.log"

# 运行性能测试
echo -e "${YELLOW}运行性能测试...${NC}"
pnpm test:performance > $RESULTS_DIR/performance.log
PERFORMANCE_TEST_RESULT=$?
display_test_stats "性能测试" "$RESULTS_DIR/performance.log"

# 输出测试结果摘要
echo -e "${YELLOW}${BOLD}===== 测试结果摘要 =====${NC}"
if [ $UNIT_TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ 单元测试通过${NC}"
else
    echo -e "${RED}✗ 单元测试失败${NC}"
fi

if [ $PLUGINS_TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ 插件测试通过${NC}"
else
    echo -e "${RED}✗ 插件测试失败${NC}"
fi

if [ $SECURITY_TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ 安全测试通过${NC}"
else
    echo -e "${RED}✗ 安全测试失败${NC}"
fi

if [ $INTEGRATION_TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ 集成测试通过${NC}"
else
    echo -e "${RED}✗ 集成测试失败${NC}"
fi

if [ $PERFORMANCE_TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ 性能测试通过${NC}"
else
    echo -e "${RED}✗ 性能测试失败${NC}"
fi

echo ""
echo -e "${YELLOW}===== 测试覆盖率报告 =====${NC}"
echo -e "${YELLOW}生成测试覆盖率报告...${NC}"
pnpm test:coverage

# 显示覆盖率摘要
if [ -f "coverage/coverage-summary.json" ]; then
    echo -e "\n${BLUE}覆盖率统计:${NC}"
    echo -e "  语句覆盖: $(jq -r '.total.statements.pct' coverage/coverage-summary.json)%"
    echo -e "  分支覆盖: $(jq -r '.total.branches.pct' coverage/coverage-summary.json)%"
    echo -e "  函数覆盖: $(jq -r '.total.functions.pct' coverage/coverage-summary.json)%"
    echo -e "  行覆盖率: $(jq -r '.total.lines.pct' coverage/coverage-summary.json)%"
fi

echo -e "\n${YELLOW}覆盖率报告已生成在 coverage/ 目录下${NC}"
echo -e "使用浏览器打开 coverage/index.html 可查看详细报告"

# 检查是否所有测试都通过
if [ $UNIT_TEST_RESULT -eq 0 ] && [ $PLUGINS_TEST_RESULT -eq 0 ] && [ $SECURITY_TEST_RESULT -eq 0 ] && [ $INTEGRATION_TEST_RESULT -eq 0 ] && [ $PERFORMANCE_TEST_RESULT -eq 0 ]; then
    echo -e "\n${GREEN}${BOLD}所有测试通过!${NC}"
    exit 0
else
    echo -e "\n${RED}${BOLD}部分测试失败，请检查详细输出.${NC}"
    exit 1
fi 