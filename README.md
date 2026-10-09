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
- `dist/app.js`：加载数据集、装配模块并启动应用；不包含计算或场景实现。
- `dist/modules/application-selection.js`、`application-backends.js`：明确解析发布版本/后端/工况，并装配有界兼容接口；不自动回退后端。
- `dist/modules/deployment-state.js`、`assessment-controller.js`：应用输入状态、计算快照、调度与取消。
- `dist/modules/main-assessment.js`：注入几何接口的 legacy 单点评估，复用共享射线/响应核心。
- `dist/modules/compiled-main-assessment.js`：冻结 BVH 工况的主应用会话，复用 `compiled-assessment.js` 的同一个分批评估与结果适配。
- `dist/modules/main-page.js`、`legacy-scene-view.js`、`projection-canvas-view.js`：DOM、legacy 三维显示和结果图层，均不拥有科学几何。
- `dist/modules/compiled-scene-view.js`：主应用编译网格视图，使用 `compiled-geometry-view.js` 的共享模型缓冲，不追踪射线。
- `dist/style.css`：基础样式。
- `dist/projection.css`：投影窗与热云样式。
- `dist/layout-overrides.css`：后续布局与响应式覆盖。
- `dist/data/dam_spec.json`：当前周宁数据集的坝体几何、材料、候选站点和工程参数源。
- `dist/data/dam_spec.schema.json`：规格 schema。
- `dist/vendor/three/`：离线 Three.js 0.186.0。
- `.openai/hosting.json`：当前在线站点的可选托管绑定，不参与应用运行。
- `docs/CALCULATION_MODELS.md`：计算链、公式、输出解释、参数与假定。
- `docs/GEOMETRY_SPEC_REFACTOR.md`：长期几何数据职责、Geometry IR、后端边界与验证原则。
- [有限模型图案解释工作流](docs/PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison)：经批准的有限模型参考线、开天/接受度解释、可复现站点姿态比较及 v1 导出/重放；包含独立预览派生资产的离线生成方法。主应用默认仍为 legacy DDA，并未自动迁移为编译网格后端。
- [投影数据与数值解释](docs/PROJECTION_DATA.md)：结果快照、材料贡献、等值线、图坐标及导出契约。
- [几何参考线与派生资产](docs/GEOMETRY_REFERENCES.md)：参考线语义、资格、CSG 复用与源绑定产物。
- [投影验证](docs/PROJECTION_VALIDATION.md)：数值容差、特征尺度、性能目标与解析测试基线。
- `docs/`：架构、当前数据集几何、路线图和迁移说明。

## 当前能力

- 参数化坝体、坝段、基础面和附属结构三维显示；
- 廊道、观察室、电梯井内部结构显示；
- 溢流孔和泄槽负体积掏空及内表面显示；
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

开发工具只用于检查，应用本身无需构建或 Node。安装 Node 22+ 后：

```bash
npm install
npm run check
```

`npm run check` 依次执行语法检查、类型检查（首行带 `// @ts-check` 的模块）、单元测试和几何一致性脚本；CI 在每个 PR 上运行同一命令及数据集发布门禁。也可逐条运行：

```powershell
node --check dist/app.js
node scripts/check-geometry-conformance.mjs
node --test tests/dataset-v07.test.mjs
node --test tests/compiled-mesh.test.mjs
node --test tests/material-projection.test.mjs
node --test tests/calculation-core.test.mjs
node --test tests/main-architecture.test.mjs
node --test tests/main-compiled-backend.test.mjs
node --test tests/compiled-assessment.test.mjs
node --test tests/semantic-mapping.test.mjs
node --test tests/material-envelopes.test.mjs
node scripts/check-semantic-mapping.mjs
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0 --backend compiled
git diff --check
```

详细规则见 `AGENTS.md`。

主应用独立浏览器验收：`node scripts/check-main-app.mjs`（开发环境安装 Playwright/Chromium；可用 `--playwright` 和 `--chromium` 指定已有路径）。覆盖桌面/窄屏、图层、快速改姿态、设备/站点、持久化和导出；不启动几何预览的性能任务。

编译后端主应用验收：`node scripts/check-main-compiled-app.mjs`，参数相同；验证四档冻结工况、显式返回 legacy、能力限制、模型坐标、同次结果、导出和桌面/窄屏。截图只写入临时目录。

## 在主应用中使用新几何

左侧“数据集与计算后端”中选择完整 `...@0.6.2+schema0.7.0` 发布版本，载入配置后选择 low/mid/high/extreme 冻结工况，再载入所选配置。也可通过 HTTP 直接访问：

```text
/?dataset=zhouning-lower-reservoir-dam%400.6.2%2Bschema0.7.0&backend=compiled&scenario=low
```

URL 中的 `+` 必须编码为 `%2B`；界面自动生成正确 URL。发布版本、后端与工况互相校验，未知组合失败关闭，不回退到 legacy 或另一个工况。配置切换使用完整页面重载，旧计算不会更新新场景；候选点按完整 release ID 保存，设备参数仍独立。

主应用 compiled 提供站点/姿态与设备编辑、计数/透射率、材料贡献与响应数值图层、材料路径悬停、比较和版本化快照导出。连续水位、legacy 目标轮廓/源实体显著度、内部彩色代理和 legacy 热云明确禁用；不会套用旧几何的反事实规则。场景与计算共享 GLB 模型缓冲，材质、相机和显示开关不进入物理计算。

默认仍为 legacy 发布和 DDA；回到对应发布版本即可继续使用旧连续水位与兼容功能。compiled 的有限范围、聚合源实体归属及物理标定限制仍然存在，显式接入不代表施工级或真实物理域认证。

数据格式 v0.7.0 作为独立发布标识进入注册表和显式主应用 compiled 路径；默认 UI 仍使用旧格式 v0.6.2。当前接入能力与验证入口见 [架构说明](docs/ARCHITECTURE.md#当前几何后端与接入边界)；未完成工作见 [路线图](docs/ROADMAP.md)。

通过 HTTP 服务访问 `/geometry-preview.html` 可查看共享网格/BVH 后端：四档发布工况、参考点射线材料长度、空腔/虚几何显示与组件拾取。显示与计算使用同一批模型坐标缓冲；该预览独立于主部署应用，目前不支持连续水位或完整目标显著度评估。局域网 HTTP 也执行资产校验，无运行时外部依赖。

预览现支持 25×25 / 65×65 探测器局部斜率空间柱密度图，点击像素联动同一后端射线路径，并可导出带发布版本、工况、姿态、采样和限制说明的 JSON。此图仅是材料路径资格验证，不是设备接受度加权的计数、透射率或 ROI 显著度。

柱密度默认使用抗极端值的自适应对数色标（正值像素 P98），图例列出上限和饱和像素数；需要跨视图比较时可切换固定线性色标。颜色缩放不会修改材料路径、柱密度或导出科学值。

同一预览中的 Detector assessment 使用主应用共享响应核心，对四档冻结 BVH 工况计算设备接受度加权计数和透射率，可设置曝光时间/角通量模型并导出完整参数及版本。设备使用明确标注的平台评估默认值，不冒充数据包内型号标定。设备全视场独立于材料图半视角；显示平滑不改变原始计数、材料路径或导出值。默认主应用仍使用旧数据集/DDA，ROI 显著度和连续水位未接入新后端。

Verified semantic target 可选择发布组件直接映射的水体/空腔，显示投影掩膜轮廓和射线语义体积长度。当前四工况均有 22 个直接目标；混凝土、钢闸门和岩体聚合仍未分解，22 个实体缺少独立编译归属。掩膜不是材料所有权或反事实显著度。导出含逐像素目标长度与完整审计；`check-semantic-mapping.mjs` 输出可复现的全工况映射报告。

两张投影另有默认启用的材料包络：白色混凝土、橙色近场岩体。轮廓从同次 BVH 射线的材料占据和空气交界计算，不依赖实体映射或颜色对比；可关闭空气交界深度突变特征。轮廓受角采样和发布网格边界限制，不是精确 CAD 边线，显示开关不改变计算结果。

预览新增 Material contribution contours：按材料独立选择路径长度（m）或材料水当量贡献（m.w.e.）等值线，支持明确物理级别与标注的自适应检查级别。两图使用各自实际采样坐标，独立 SVG 图层保持 CSS 像素线宽；关闭深度/边界诊断不影响贡献线。图例记录级别、覆盖及不完整/歧义状态。自适应级别不可直接跨视图比较。每张图新增独立的 contour JSON v1 导出，保留字段、级别、来源快照和完整性，显示设置单独保存；旧原始 JSON 不变。见 [贡献线预览](docs/PROJECTION_WORKFLOW.md#material-contour-controls) 和 [导出/重放契约](docs/PROJECTION_DATA.md#contour-export-and-replay)。

导入 schema 与校验值检查（开发环境需要 Python `jsonschema>=4.10`，站点运行无此依赖）：

```bash
python3 scripts/check-dataset-release.py
```

## 当前在线实例

`https://zhouning-muon-deployment.zyong06.chatgpt.site/`

该地址只是当前托管实例，不构成开发环境或 AI 工具依赖。若需要继续发布到同一实例，迁移时保留 `.openai/hosting.json`；使用其他托管平台时可忽略该文件。
