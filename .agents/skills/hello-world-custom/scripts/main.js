/**
 * Hello World Custom Skill - 主执行脚本
 * 版本号: v1.0.0
 * 创建时间: 2026-04-09
 * 
 * 功能: 响应用户问候，展示自定义 Skill 的加载成功
 */

// 获取当前时间，用于个性化问候
function getGreetingByTime() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

// 主处理函数
function processRequest(userInput) {
  const greeting = getGreetingByTime();
  
  const response = {
    success: true,
    message: `${greeting}！👋`,
    details: {
      skillName: "hello-world-custom",
      skillVersion: "1.0.0",
      skillPath: ".agents/skills/hello-world-custom",
      loadSource: "用户自定义 Skill 目录",
      timestamp: new Date().toLocaleString('zh-CN')
    },
    content: `
## 🎉 自定义 Skill 加载成功！

**${greeting}！** 我是你从 ".agents/skills" 目录加载的自定义 Skill。

### 📋 Skill 信息

| 属性 | 值 |
|------|-----|
| **名称** | hello-world-custom |
| **版本** | v1.0.0 |
| **路径** | .agents/skills/hello-world-custom |
| **来源** | 用户自定义 Skill 目录 |
| **加载时间** | ${new Date().toLocaleString('zh-CN')} |

### ✅ 测试结论

恭喜你！".agents/skills" 目录的自动加载功能**工作正常**！

这意味着你现在可以：
1. 在此目录下创建自己的自定义 Skill
2. 开发符合你业务需求的专属功能
3. 与系统内置 Skill 共存，互不干扰

### 💡 下一步

你可以基于这个示例 Skill 的结构，开发你自己的自定义 Skill 了！
    `.trim()
  };
  
  return response;
}

// 导出主函数
module.exports = {
  processRequest,
  getGreetingByTime
};

// 如果直接运行此脚本，执行测试
if (require.main === module) {
  console.log("=== Hello World Custom Skill 测试 ===");
  const result = processRequest("测试");
  console.log(JSON.stringify(result, null, 2));
}
