# 架构说明

## 当前形态

项目是无构建步骤的静态 Web 应用：

```text
app.js：发布/后端/工况选择与依赖装配
  ├─ application-selection → application-backends → dataset-loader
  │   ├─ legacy-geometry-adapter → geometry-kernel / dda-ray-tracer
  │   └─ compiled-mesh-runtime → compiled-glb / triangle-bvh
  ├─ deployment-state → device-configuration / detector-defaults
  ├─ main-assessment 或 compiled-main-assessment → 共享 detector-projection / muon-response
  ├─ assessment-controller：快照、取消、进度与结果发布
  └─ main-page → legacy 或 compiled-scene-view / projection-canvas-view / main-pattern-view
```

发布目录固定为 `dist/`，运行时不访问 CDN 或后端 API。

本文记录当前实现与目标边界，不记录任务完成流水。架构决策（含长期几何数据原则）见 [ARCHITECTURE_DECISIONS](planning/ARCHITECTURE_DECISIONS.md)；未完成工作、需求与优先级仅在 [planning/](planning/ROADMAP.md) 维护。

## 核心数据流

```text
数据集 → 计算所有的几何适配器             → legacy 视觉适配器 → Three.js
站点 / 设备 / 环境 → 不可变 deployment-state
                   → controller 捕获快照
                   → assessment session：热云 / 快速指标 / 25² → 65²
                   → 同次结果 → DOM / Canvas / Three.js / 导出
```

计算模块不导入视图；几何模块不导入评估或投影。控制器只接受 assessment 端口和回调，不导入具体几何、DOM 或渲染器。视图不追踪射线、不分类材料；Three.js 对象不进入科学结果。共享纯方向模块不构成视图—评估互相依赖。

输入由 deployment-state 拥有并只读发布；视图拥有选择、颜色、相机和图层状态。main-assessment 的每个 session 复制站点、设备、响应和环境，绑定一个几何上下文；预览与最终 pass 均消费同一 session。控制器在输入变化时取消待执行批次并使旧代号失效，旧结果不能发布。通量/分箱缓存由 assessment 实例拥有，设备设置改变时显式清除。

legacy 场景中的程序化表面、坐标显示偏移和相机预设是有界兼容适配，不是通用平台常数；默认站点姿态和旧方案 JSON 约定属于 legacy-deployment-adapter。它们不作为材料或射线真值。compiled 主应用视图复用 compiled-geometry-view 的计算所有缓冲；geometry-preview 独立，不作为主应用依赖。

## 当前计算策略

主应用的谱、积分通量、连续能损和显著度公式已提取至 `dist/modules/muon-response.js`；原生条差接受度、像素计数、分批投影与显示分辨率卷积位于 `detector-projection.js`。它们不依赖 DOM/Three.js，通过注入方向与射线结果支持不同几何后端。`dda-ray-tracer.js` 提供纯 DDA 遍历；`legacy-geometry-adapter.js` 绑定 legacy 数据集/环境；`deployment-state.js` 管理输入，`assessment-controller.js` 管理取消/调度，`main-page.js` 与独立视图消费结果；快预览和最终投影均调用同一个 `createProjectionPass`。

各步骤的公式、参数、界面输出含义和适用边界详见 `CALCULATION_MODELS.md`。

- 候选点/姿态改变后延迟约 160 ms 更新。
- 投影先计算 25×25 快速预览，随后计算 65×65 最终结果。
- 65×65 像素由设备原生条读出斜率格聚合得到。
- 投影计算按批次让出事件循环，避免页面长时间冻结。
- 通量积分和原生斜率分箱带内存缓存。
- 设备与候选站点状态保存在 `localStorage`。
- 当前数据集材料点分类由 `dist/modules/geometry-kernel.js` 提供，近场外回退到远场地形；控制点和 200 条参考射线回归入口为 `scripts/check-geometry-conformance.mjs`，测试目标由数据集注册表解析，不绑定具体版本目录。
- `dist/modules/dataset-loader.js` 支持按完整发布标识加载；v0.7 接入经 `dataset-validation.js` 与 `dam-spec-v07.js` 进入版本化 IR。`coordinates.js` 提供独立的点/方向正反变换。新发布可在主应用显式选择 compiled 冻结工况，默认保持旧格式；解析资格后端不进入生产计算。
- `geometry-v07-qualification.js` 是原生 v0.7 解析资格后端，支持拱形扫掠、结构裁切、充水工况和上游种子连通；使用编译后地形采样，尚未替代生产 DDA、CSG 或网格/BVH。入库 schema 门禁位于 `scripts/check-dataset-release.py`，HTTP 加载和失败路径测试位于 `tests/dataset-v07.test.mjs`。
- `compiled-glb.js` 解码冻结工况的 GLB，`triangle-bvh.js` 为计算所有的模型坐标缓冲建立纯 CPU 空间索引，`compiled-mesh-runtime.js` 提供点材料分类、材料分段与密度积分。`compiled-geometry-view.js` 直接使用这些位置/索引数组，显示开关不参与计算；`geometry-preview.html` 是独立预览入口；主应用可显式选用 compiled，同一入口默认仍为 legacy DDA。

## 当前几何后端与接入边界

| 入口/后端 | 当前用途 | 关键限制 |
| --- | --- | --- |
| 主应用 legacy DDA | 默认旧格式发布、连续水位 UI、单站响应与兼容数值图层 | 尚未切换到 v0.7 编译网格；DDA 与数据集适配为纯模块；调度、应用状态与显示已分离；计算仍保留 legacy 兼容语义 |
| v0.7 解析资格后端 | 通过完整 release ID 加载规格及版本化 IR，验证解析实体 | 有界数据集适配，不是任意 v0.7 CSG 执行器；地形近似与水体区间填充不能当作完整连通算法 |
| 编译网格/BVH | 主应用显式选项与独立预览的冻结工况、模型分类、材料路径和共享设备评估 | 不解析连续水位；聚合源实体归属未解决；主应用明确禁用旧目标/显著度、内部代理与热云 |

`dda-ray-tracer.js` 无运行时 imports，不依赖 DOM、Three.js、投影或编译几何。createDdaRayTracer 接受显式坐标 bounds、maxDistanceM、有序 densities、targetIds 和 classifyPoint(x,y,z,environment)；返回的同步 tracer 接受普通 {x,y,z} 点、单位方向及 {cellM,refineM,environment}。`legacy-geometry-adapter.js` 保留旧文档坐标域、高程 150–600 m、500 m 上限和钢材 fallback；这些是 legacy 兼容配置，不是平台默认规则。适配器只依赖几何内核和 tracer，创建时复制规格、identity 和地形缓冲；坐标交换与高程偏移取自有界支持的声明，方向不接受平移。bindEnvironment 为每次计算返回不可变的 identity、材料、环境、坐标转换、traceDoc/traceModel 与 traceSettings；不读取 DOM 或当前 UI。

环境只支持变化的 upstream 和数据集固定 downstream；其他环境字段、非有限水位、非旧格式数据集及不支持的坐标约定失败关闭，不伪造完整水力连通或连续编译工况。主应用一次预览/最终计算通过同一绑定上下文调用坐标、分类/追踪、元数据与图案适配；显示控制不进入 tracer。方向运算在纯 detector-pose 中保留旧 Vector3 的运算顺序，无 Three.js 依赖；legacy 场景几何转换归视图。

遍历保留入域偏移、三点采样、最多八层细分、按材料合并单元和 10000 次循环保护。因此它仍是 legacy 近似，不是精确界面追踪；细薄结构漏采样、单元合并不区分目标标签及保护上限的历史行为未在本次提取中修正。tests/dda-ray-tracer.test.mjs 使用冻结测试基线验证真实参考方向、边界/反向/并列网格、不同水位、完整 25/65 投影和依赖边界。测试基线只在 tests/fixtures，运行时不得引用。

注册表以完整发布标识区分同数据版本的不同 schema。Loader 验证源/manifest/资产摘要、工况与跨引用；主应用先解析完整 release/backend/scenario，再使用 loadDataset(releaseId)。loadDefaultDataset 仅为 legacy 兼容调用保留，不用于新主应用装配。控制点和参考射线以注册表解析的数据集为基准。

编译 GLB 解码只接受受支持的冻结静态 indexed triangles，处理节点变换、访问器布局和绕向反转；外部缓冲、稀疏访问器、压缩、动画/蒙皮及未登记节点失败关闭。物理组件核对 manifest、材料和闭合/绕向/净体积；虚几何不建立物理 BVH。位置/索引由计算拥有，视图仅使用共享缓冲及 Z-up→Y-up 显示变换，法线和材质由视图拥有。

BVH 合并共同三角边交点，切触/沿面不累积长度，支持实体内起点和封闭空腔。组件区间按显式材料优先级消解；组件相交长度、语义占据长度和 winning-material 长度不是同一指标。直接目标只依赖 canonical ID 与显式来源映射，聚合 concrete/steel/rock 不伪造实体归属。

两张预览图分别是均匀斜率材料积分和设备条差接受度下的共享响应评估，不按像素索引对齐。编译设备适配器限制为支持的三层对称读出，未标定参数不可由数据集名称补猜。材料色标自适应/固定显示不改变科学值；逐面法线只控制视觉尖角。material-envelopes.js 的采样占据/空气深度边缘属于显示诊断，不是经认证的包络，详见 [投影工作流](PROJECTION_WORKFLOW.md)。

### 几何验证入口

以下为复现入口，不保存一次运行的成绩或性能日志：

```sh
python3 scripts/check-dataset-release.py
node --test tests/dataset-v07.test.mjs tests/compiled-mesh.test.mjs
node scripts/check-geometry-conformance.mjs
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0 --backend compiled
node scripts/check-semantic-mapping.mjs
```

命令中的周宁 release ID 是数据集示例，不是平台规则。Conformance 脚本报告资格门槛与发布门槛是否满足，并保留最大误差；analytic 的迁移公差不能冒充 compiled 发布公差。控制点检查排除距地形面小于 5 m 的点，因此不覆盖该边界带；具体数值策略以脚本及数据集基准为准，不构成测绘精度声明。

可选 HTTP 浏览器检查：node scripts/check-compiled-preview.mjs，支持 --playwright /absolute/path/to/playwright/index.mjs。Playwright/Chromium 仅是开发依赖，截图写入临时目录；检查桌面/窄屏、共享显示/计算、拾取、工况、取消与原主应用。最新未完成回归与性能限制见 planning/FEATURE_REQUIREMENTS.md（FR-N），不以旧测试结果宣称已通过。

## 当前投影与解释模块

`dist/modules/material-projection.js` 是独立于 DOM/Three.js 的局部斜率投影评估器，通过注入运行时的 `traceRayModel` 复用网格射线核心。当前预览消费材料路径与柱密度图；并非主应用的设备加权计数投影替代品。

`compiled-assessment.js` 是 BVH → 共享 `createProjectionPass` 的纯适配器，使用模型竖直方向余弦与材料柱密度，提供四档冻结工况的计数/透射率、显示平滑、元数据及取消。`detector-defaults.js` 的设备/响应默认配置与坝体数据独立，并由主应用和预览共同使用。createCompiledAssessmentPass 提供相同校验、方向采样、分批推进与结果适配；evaluateCompiledAssessment 是预览/批量调用的异步包装，compiled-main-assessment 为主控制器提供会话。两条路径不复制公式或追踪。默认 DDA 不变，源实体 ROI 尚未提供。

`legacy-target-interpretation.js` 消费同次 legacy trace 与绑定材料快照，不依赖几何后端、DOM、Three.js 或投影模块；只引用共享 muon-response 数学。createLegacyTargetInterpreter 复制有序目标 ID 和水/混凝土密度，派生 edgeProfile、targetMask 与 counterfactualMwe，不改写原始路径或 cells。完整单元 t0<2 m 被排除出目标调整（不在 2 m 处分割），mask 使用严格大于 0.15 m，首次密集/混凝土入口仍包含近处单元；缺失入口保持 Infinity 的 legacy 内部表示。

evaluateLegacyTargetSignificance 接受显式 flux 与系统误差；未命中或 dam 返回零，其余调用共享最低能量和显著度公式。选择归视图状态，显著度缓存归 assessment session，最终结果门禁归控制器，目标轮廓绘制归 projection-canvas-view。水移除、空腔填混凝土、非 dam 混凝土移除及下限零裁切都是旧模型启发式，不证明源实体归属或可探测性；该模块不用于编译后端实体 ROI。

`semantic-mapping.js` 仅审计显式 canonical source ID，生成直接目标索引；运行时点/射线与渲染拾取使用同一 ID。两种投影记录射线的语义体积相交长度，用于直接目标轮廓；聚合材料的实体归属和反事实 ROI 显著度仍未解决。

`projection-pattern-fields.js` 将同次计算的原生网格、材料路径/柱密度与预先快照的几何元数据转换为标准化字段，并将 `contribution-contours.js` 的 D3 数值等值线映射到各图自己的等宽显示单元。探测器加权斜率中心按分段坐标转换，不与材料图按像素索引对齐；两个图独立提取，不引入重采样或响应公式副本。预览接入独立材料/数量/级别控制，`contribution-view.js` 只消费映射后的线数据生成固定 CSS 像素宽度 SVG；结果与提取设置限定的缓存不修改科学数组。`contribution-export.js` 提供独立 v1 等值线导出与离线重放验证，显示样式不进入科学身份，旧结果导出不迁移。浏览器最坏性能仍待验证。

异步图层计算：`numeric-pattern-work.js` 复用上述纯字段、D3 提取和原生网格映射核心；`numeric-pattern-worker.js` 仅保存每张图的当前精简标量输入，不重新追踪射线。`numeric-pattern-client.js` 使用计算结果身份、设置键和有界缓存管理异步工作；输入变化时终止 worker、清除任务，旧结果不能更新当前图。UI 仅插入 worker 准备的 SVG 路径、图例和来源信息。结构参考 worker 同样承担字段验证、映射和路径文本准备；保留原始斜率空间线用于导出。`pattern-timing.js` 的诊断不进入科学结果；`demand-render.js` 按需调度 3D 显示并保留相机阻尼。详见 [未完成工作](planning/IMPLEMENTATION_PRIORITY.md)；这些改动不代表物理界面认证或默认后端迁移。

结构参考线纯核心渐进拆为 `structural-reference-candidates.js`（已复用/验证的 VTK 候选边）、`structural-reference-qualification.js`（显式完整面资格记录的验证与过滤）及 `structural-reference-projection.js`（透视除法前整段视场/径向射程裁切）。这些模块不依赖渲染器，不修改射线/响应结果；供显式面资格及有限模型消费者使用；有限模型预览已经接入，真实物理界面认证仍未完成。编译器域盖面开发审计与限制见 [结构参考线契约](GEOMETRY_REFERENCES.md#candidate-qualification-and-projection)。

开发端已验证 [Manifold CSG 复用](GEOMETRY_REFERENCES.md#offline-interface-construction)：按共享材料优先级分割体积，再提取全局有限网格—空气边界，保留输入组件/三角面谱系并处理部分接触面。它不是浏览器运行依赖，也不替换科学网格；派生资产源绑定与有限模型消费已实现，但不代表真实物理域认证或主应用后端迁移。资格适配器支持显式启用两个已验证空气界面之间的共面材料过渡边，不把域盖面/未知面边界当作物理轮廓。

[派生界面资格产物](GEOMETRY_REFERENCES.md#derived-interface-artifact-contract) v1.0.0 已实现源/工况/几何哈希、原生输入回执、域策略与面谱系绑定，以及纯模块校验；开发生成器默认输出到新临时目录，不改发布资产。加载后的 Float64 派生缓冲使用同一 `triangle-bvh.js` 验证空气/非空气区间，一致性检查比较非空气区间、端点与长度，并要求科学缓冲不变。此产物不授予物理包络资格；有限模型参考线在预览中使用；真实物理域认证与最坏浏览器性能仍未完成。BVH 同时接受 Float32/Float64，现有科学输入保持 Float32 与原数值行为。

几何数据契约、Geometry IR、运行时产物与 DD4hep/GDML 后端的决策见 [ARCHITECTURE_DECISIONS](planning/ARCHITECTURE_DECISIONS.md) ADR-008…011，数据契约要求见 FEATURE_REQUIREMENTS FR-D。

有限模型操作与契约见 [图案解释工作流](PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison)：`finite-reference-worker.js` 校验独立派生资产，`finite-model-references.js` 消费有限模型边界（不授予真实物理界面资格）。已接入独立参考线、响应数值等值线、开天上下文、悬停谱系和 v1 图层/比较导出。`response-patterns.js` 使用共享响应直接保留的开天计数；`pattern-comparison.js` 定义统一指标，`pattern-comparison-batch.js` 复用单站科学核心进行显式小批量计算。`legacy-pattern-adapter.js` 与 `main-pattern-view.js` 将兼容的数值图层和比较接入主应用，明确保留 legacy DDA 身份；编译参考线仍只在兼容的独立预览中显示；主应用只迁移冻结几何与共享评估，不引入参考线/性能扩展。既有物理公式与发布几何保持不变。

## 显式主应用后端选择

application-selection 校验 registry 中的完整 release ID 和兼容 backend；未提供选择时使用既有 registry 默认值。application-backends 是有界依赖装配，不是插件系统：legacy 保留原坐标/DDA/连续水位行为，compiled 在已登记冻结工况中绑定一个 GLB/BVH 运行时。错误工况、未知发布或不兼容后端失败关闭，不尝试其他后端。

主控制器只消费 createSession/projection/advance/complete 端口。compiled 会话捕获相同站点、设备、响应和冻结 variables，并拒绝其他环境值；25² 与 65² 均复用已有 compiled-assessment。射程由站点至有限模型 bounds 最远角点距离确定，包住全部发布网格；超出支持范围则报错，不暗中截断。域外未知材料仍可能导致透射高估。

UI 从 capabilities 禁用不支持的连续水位、旧目标/显著度、彩色内部代理与热云。模型坐标和科学结果不使用 Three.js 对象；视图只消费缓冲和同次区段。发布/工况切换使用完整页面重载，清除旧任务；站点存储按 release ID 隔离，设备配置独立。旧部署导出格式保留；新 compiled-deployment-snapshot v0.1 记录来源、资产、模型域、工况、设备与中心射线，不宣称完整方案 save/load。

主应用双后端、四工况、拒绝路径与数值一致性在 tests/main-compiled-backend.test.mjs；HTTP 验收在 scripts/check-main-compiled-app.mjs。材料点与参考射线继续使用 release conformance 门槛；P95 门槛通过不代表最大误差为零或真实物理域已认证。

## 主应用源码入口

保持无构建步骤的原生 ES Modules；文件直接位于 dist/modules，不维护另一份 src 镜像（决策见 ADR-013，计划由 ADR-004 取代）。

| 模块 | 拥有的职责 | 不允许的依赖 |
| --- | --- | --- |
| application-selection / application-backends | 发布/后端/工况解析与有界依赖装配 | 视图实现、公式副本 |
| dataset-loader / legacy-geometry-adapter / compiled-mesh-runtime | 发布资产、坐标、环境绑定、材料/射线真值 | DOM、Three.js、投影、应用控制器 |
| detector-defaults / device-configuration / detector-pose | 设备默认值、旧设置约束、纯方向 | 数据集、DOM、场景 |
| deployment-state | 站点、设备、响应、环境；不可变输入与命令 | 视图、几何后端 |
| muon-response / detector-projection | 共享物理近似、设备格与像素响应 | DOM、场景、具体几何后端 |
| main-assessment / compiled-main-assessment | 同次单点评估会话；显式几何端口、共享核心、结果适配 | DOM、Three.js、具体后端构造 |
| assessment-controller | 输入快照、调度、取消、进度和发布 | 具体后端、视图实现 |
| legacy-deployment-adapter / compiled-deployment-adapter | 有界数据集站点/导出约定 | DOM、场景 |
| main-page | DOM 绑定、存储适配、视图状态；调用状态命令 | 科学公式、射线实现、调度循环 |
| legacy-scene-view / compiled-scene-view / projection-canvas-view / main-pattern-view | 场景、Canvas/SVG 和图例 | 科学几何实现、射线求交 |
| app.js | 加载、构造、注入、启动与启动错误提示 | 计算和场景实现 |

主应用依赖图、纯模块边界、快照/取消与整链数值回归在 tests/main-architecture.test.mjs；可选 HTTP 桌面/窄屏验收在 scripts/check-main-app.mjs。独立 geometry-preview 不参与主应用装配，也未被迁移成平台依赖。

## 重构原则

已迁移至 [ARCHITECTURE_DECISIONS ADR-012](planning/ARCHITECTURE_DECISIONS.md#adr-012-refactoring-principles)。

## 建议测试层次

1. 单元测试：坐标互逆、点分类、材料密度、设备斜率格。
2. 几何回归：选定空间点和标准射线的材料标签/长度快照。
3. 投影回归：固定规格、站点和设备参数下的总计数、透射率和若干像素。
4. UI 冒烟：切换站点/姿态、侧栏、投影模式、保存加载。
5. 视觉回归：典型透视、上游正视、横剖面和坝顶俯视截图。
