# EdgeSpeak Skills

[English](README.md) · **简体中文**

让任意支持 Agent Skills 的客户端,经 [EdgeSpeak](https://edgespeak.com) 在**本机**转写音视频 —— 音频不出设备。

## 安装

```bash
# 自动识别当前 agent
npx skills add lattifai/EdgeSpeak-Skills

# 或指定 agent
npx skills add lattifai/EdgeSpeak-Skills --agent claude-code
npx skills add lattifai/EdgeSpeak-Skills --agent cursor
npx skills add lattifai/EdgeSpeak-Skills --agent codex
```

需要本机装有 [EdgeSpeak](https://edgespeak.com) (和 / 或 `edgespeak-cli`)。

## 包含的 Skill

| Skill | 能力 |
|-------|------|
| [`edgespeak-transcribe`](skills/edgespeak-transcribe/SKILL.md) | 把音视频转成文字 / SRT / JSON, 全程本地 |
| [`edgespeak-align`](skills/edgespeak-align/SKILL.md) | 把音频与已有文稿做强制对齐 → 词级时间戳 (逐词高亮字幕、按句剪辑、配音对齐) |
| [`edgespeak-segment`](skills/edgespeak-segment/SKILL.md) | 把一大段 (甚至无标点的) 文字切成自然句子 |

## 原理

Skill 经 `edgespeak-cli` (`transcribe` / `align` / `segment`) 调本机 EdgeSpeak 网关 (OpenAI 兼容, `127.0.0.1:1117`, 强制本地路由)。音频在设备内处理, 不上传。

## 许可

MIT —— 见 [LICENSE](LICENSE)。
