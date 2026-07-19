# EdgeSpeak Skills

[English](README.md) · **简体中文**

让任意支持 Agent Skills 的客户端，经 [EdgeSpeak](https://edgespeak.com) 在**本机**转写音视频 —— 音频不出设备。

## 安装

```bash
# 自动识别当前 agent
npx skills add lattifai/EdgeSpeak-Skills

# 或指定 agent
npx skills add lattifai/EdgeSpeak-Skills --agent claude-code
npx skills add lattifai/EdgeSpeak-Skills --agent cursor
npx skills add lattifai/EdgeSpeak-Skills --agent codex
```

## 前置要求

大部分 Skill 调用 `edgespeak-cli` —— 一个自包含的本机转录运行时 (macOS arm64)。卡拉 OK Skill 优先使用已配置的 EdgeSpeak MCP 工具，并回退到同一个 CLI。本地运行时有两种获取方式：

- **自包含 CLI —— 无需桌面 App：**

  ```bash
  curl -fsSL https://edgespeak.com/install.sh | sh
  ```

  会把自包含运行时 (CLI + 本地引擎 + 依赖) 安装到 `~/.edgespeak/runtime`，并把 `edgespeak-cli` 软链进 `~/.local/bin` (PATH 自动配好)。

- **桌面 App：** 从官网安装 [EdgeSpeak](https://edgespeak.com)，它自带同一个 `edgespeak-cli`。

无论哪种方式，装完后验证一下：

```bash
edgespeak-cli --version
edgespeak-cli status
```

之后用 `edgespeak-cli update` 更新运行时 (重新拉取最新的自包含包)。

## 激活

首次使用需要一次性激活 —— 本地引擎需要有效授权：

```bash
# 浏览器登录：新账号自动获得 7 天免费试用，已购账号直接激活本机
edgespeak-cli login

# 已有授权 Key 时也可直接激活
edgespeak-cli activate <KEY>
```

`login` (长期别名 `trial`) 打开浏览器登录并自动完成激活；`--no-browser` 只打印登录链接，`--json` 输出激活后的授权状态。`<KEY>` 是你的授权 Key (以 `ES-` 开头，来自 [edgespeak.com](https://edgespeak.com))。激活会联网一次，用 Key 换取签名凭据并落地本机。买断授权会显示为 `lifetime`；除非显式开启 full offline mode，`edgespeak-cli status` 还会显示缓存授权可在无网络下工作的时间窗口。也可以用 `--stdin` 传 Key (避免进 shell 历史) 或环境变量 `EDGESPEAK_LICENSE_KEY`。随时可跑 `edgespeak-cli status` 查看授权方案、试用剩余时间、离线缓存窗口和锁定原因；过期或失效时会给出 [edgespeak.com](https://edgespeak.com) 的购买链接。

## 包含的 Skill

| Skill | 能力 |
|-------|------|
| [`edgespeak-transcribe`](skills/edgespeak-transcribe/SKILL.md) | 把音视频转成文字 / SRT / JSON，并支持时间轴与分句参数，全程本地 |
| [`edgespeak-align`](skills/edgespeak-align/SKILL.md) | 把音频与已有文稿做强制对齐 → 词级时间戳 (逐词高亮字幕、按句剪辑、配音对齐) |
| [`edgespeak-segment`](skills/edgespeak-segment/SKILL.md) | 把一大段 (甚至无标点的) 文字切成自然句子 |
| [`edgespeak-broadcast`](skills/edgespeak-broadcast/SKILL.md) | 把文字变成语音 (播报)，全程本地：可选或克隆声音、风格指令、可复现种子，输出 WAV |
| [`edgespeak-karaoke`](skills/edgespeak-karaoke/SKILL.md) | 生成带样式的逐词高亮 ASS 字幕，可用真实视频帧预览预设，并尽量按源容器烧录硬字幕 |

## 原理

转录、对齐、分句与播报 Skill 经 `edgespeak-cli`（`transcribe` / `align` / `segment` / `speech`）工作；卡拉 OK Skill 优先使用已配置的 EdgeSpeak MCP，CLI 作为回退。EdgeSpeak 桌面 App 在运行时，CLI 连接它的本机网关（OpenAI 兼容，`127.0.0.1:1117`，强制本地路由）并复用暖模型 (proxy 模式)；App 没起时，CLI 自己拉起随附的本地引擎 (standalone 模式) —— 这是正常模式，不是错误。两种情况音频都在设备内处理，不上传。

## 许可

MIT —— 见 [LICENSE](LICENSE)。
