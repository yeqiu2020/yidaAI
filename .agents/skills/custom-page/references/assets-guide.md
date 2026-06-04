# 素材资源指南

在自定义页面开发中，经常需要使用图片、音乐/音效、Icon 等素材资源。以下是推荐的素材获取方案，确保素材来源稳定、合规、风格一致。

## 图片素材

| 素材库 | API | 授权方式 | 推荐场景 |
| --- | --- | --- | --- |
| [Unsplash](https://unsplash.com) | ✅ | 免费商用，无需署名 | 高质量背景图、Banner、配图 |
| [Pexels](https://pexels.com) | ✅ | 免费商用，无需署名 | 人物、场景、商务类配图 |
| [Pixabay](https://pixabay.com) | ✅ | 免费商用，无需署名 | 插画、矢量图、通用配图 |
| [Lorem Picsum](https://picsum.photos) | ✅ | 免费 | 开发阶段占位图 |

## 音乐/音效素材

| 素材库 | 授权方式 | 署名要求 | 推荐场景 |
| --- | --- | --- | --- |
| [Pixabay Music](https://pixabay.com/music/) | 免费商用 | 无需 | 背景音乐、氛围音效 |
| [Mixkit](https://mixkit.co/free-sound-effects/) | 免费商用 | 无需 | 短音效、UI 交互音 |
| [Freesound](https://freesound.org) | CC0 / CC BY | ⚠️ 部分需署名 | 按钮音效、提示音、环境音 |

- 优先使用 Pixabay Music 和 Mixkit（无署名要求）
- 使用 CC BY 素材时，需在页面底部添加署名
- 音频文件建议上传到 CDN，移动端使用压缩后的 MP3 格式

## Icon 素材

| 图标库 | 授权方式 | 推荐场景 |
| --- | --- | --- |
| [iconfont（阿里）](https://www.iconfont.cn) | 免费 | **首选**，国内访问最稳定 |
| [Remix Icon](https://remixicon.com) | Apache 2.0 | 开源免费，风格现代 |
| [Font Awesome](https://fontawesome.com) | MIT（免费版） | 覆盖面广，通用 UI 图标 |
| [Material Icons](https://fonts.google.com/icons) | Apache 2.0 | 数量大，适合中后台工具 |

**SVG 内联**（少量图标，无外部依赖）：

```javascript
function renderIcon(iconPath, size, color) {
  return (
    <svg width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="2">
      <path d={iconPath} />
    </svg>
  );
}
```

## 素材使用通用建议

### 稳定性
- 生产环境的图片/音频应上传到自有 CDN，避免第三方外链失效
- 同一关键词可并行查 2-3 个库，失败自动切换

### 合规性
- 优先使用无署名要求的素材库（Unsplash、Pexels、Pixabay、Mixkit）
- 使用 CC BY 素材时必须添加署名

### 一致性
- 同一项目中统一使用一个图标库，避免混用
- 准备「语义→图标名」映射表

### 性能
- 图片使用合适尺寸（避免加载 4K 大图）；音频使用压缩后的 MP3 格式
- 图标优先使用 CDN 字体方案（iconfont / Remix Icon），少量图标可用 SVG 内联

---

## CDN 安全规范

> ⚠️ **安全风险警告：禁止引用未知或不可信的 CDN 地址**

**安全规范：**
- ✅ 生产默认只推荐阿里云 CDN（`g.alicdn.com` / `alicdn.com`）或客户企业自托管 CDN
- ✅ Tailwind browser 默认使用已验证地址：`https://g.alicdn.com/code/lib/tailwindcss-browser/0.0.0-insiders.fed6c6a/index.global.min.js`
- ✅ 引用第三方 CDN 资源时，建议添加 `integrity` 属性（SRI 校验）
- ⚠️ `cdnjs.cloudflare.com`、`unpkg.com` 等海外 CDN 只能作为本地调试参考，不要写入默认生成模板
- ❌ **禁止使用 `cdn.jsdelivr.net`**：存在已知安全风险
- ❌ **禁止使用 `fonts.googleapis.com`**：国内大陆无法访问
- ❌ 禁止引用来源不明的 CDN 地址
