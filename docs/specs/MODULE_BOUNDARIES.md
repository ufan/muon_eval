# 模块边界规格

主应用模块的所有权与依赖规则。`tests/main-architecture.test.mjs` 自动检查依赖图与纯模块边界；修改模块职责时须同时更新本规格与该测试。当前实现的整体说明见 [架构说明](ARCHITECTURE.md)，相关决策见 ADR-002、ADR-012、ADR-013。

## 依赖方向

计算模块不导入视图；几何模块不导入评估或投影。控制器只接受 assessment 端口和回调，不导入具体几何、DOM 或渲染器。视图不追踪射线、不分类材料；Three.js 对象不进入科学结果。共享纯方向模块不构成视图—评估互相依赖。

## 模块所有权

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
