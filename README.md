# 坝体缪子部署交互评估

浏览器内运行的 Three.js 静态应用，用于探索坝体缪子探测器的候选站点、姿态、材料路径和预期投影。当前内置周宁下库大坝作为首个数据集与验证案例；目标是逐步支持加载其他坝体几何。

## 快速开始

Windows 本机：

```powershell
.\启动本机离线版.cmd
```

浏览器访问 `http://127.0.0.1:8765/`。不要直接打开 `dist/index.html`，因为浏览器会阻止 `file://` 页面加载 ES Modules 和 JSON。

也可直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -BindAddress 127.0.0.1 -Port 8765 -OpenBrowser
```

Docker：

```bash
docker compose up -d --build
```

访问 `http://localhost:8080/`。

## 目录

- `AGENTS.md`：跨坝体通用的代理开发规则与验证要求。
- `CONTEXT.md`：使用场景、几何语义、术语及待完善领域上下文。
- `dist/index.html`：页面与控件。
- `dist/app.js`：三维场景、几何分类、射线、物理估算、投影和交互。
- `dist/style.css`：基础样式。
- `dist/projection.css`：投影窗与热云样式。
- `dist/layout-overrides.css`：后续布局与响应式覆盖。
- `dist/data/dam_spec.json`：当前周宁数据集的坝体几何、材料、候选站点和工程参数源。
- `dist/data/dam_spec.schema.json`：规格 schema。
- `dist/vendor/three/`：离线 Three.js 0.186.0。
- `.openai/hosting.json`：当前在线站点的可选托管绑定，不参与应用运行。
- `docs/CALCULATION_MODELS.md`：计算链、公式、输出解释、参数与假定。
- `docs/`：架构、当前数据集几何、路线图和迁移说明。

## 当前能力

- 参数化坝体、坝段、基础面和附属结构三维显示；
- 廊道、观察室、电梯井内部结构显示；
- 溢流孔、泄槽和泄洪底孔负体积掏空及内表面显示；
- 候选站点增删、坐标和姿态编辑；
- 方位角、仰角数字输入与滑条同步；
- 可配置探测器几何和响应参数；
- 自适应 DDA 射线材料分类与水当量柱密度估算；
- 25×25 快速预览和 65×65 最终投影；
- 预计计数、透射率、结构显著度和目标轮廓；
- 投影像素悬停联动三维射线、体素和结构标记；
- 站点评估指标、三维热云和 JSON 方案导出；
- 本机、局域网、Docker/Nginx 和静态站点托管部署。

## 最小检查

```powershell
node --check dist/app.js
git diff --check
```

详细规则见 `AGENTS.md`。

## 当前在线实例

`https://zhouning-muon-deployment.zyong06.chatgpt.site/`

该地址只是当前托管实例，不构成开发环境或 AI 工具依赖。若需要继续发布到同一实例，迁移时保留 `.openai/hosting.json`；使用其他托管平台时可忽略该文件。
