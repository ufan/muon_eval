# 几何规范与几何模块重构建议

## 1. 结论

周宁数据集 v0.6.1 已经从“页面使用的一份参数 JSON”演进为可发布、可编译、可验证的数据产品。平台不应继续让 `dist/app.js` 同时承担规格解释、CSG、地形拼接、显示网格、材料分类和射线求交。

建议保留 `dam_spec.json` 作为工程几何与语义的权威源，通过离线编译器生成稳定的 Geometry IR 和不同后端产物：浏览器使用 GLB、地形数组和材料查询结构；Geant4 使用 GDML；未来 DD4hep 使用 Compact XML 与 detector constructor。渲染器、快速射线和粒子仿真必须消费同一次编译结果，并由共同的控制点和参考射线验证。

本建议以 `zhouning-lower-reservoir-dam@0.6.1` 为第一个真实数据集，不把它的坝段数量、坐标范围和几何类型固化成平台规则。更高层抽象应等待第二个真实坝体数据集验证。

## 2. v0.6.1 评估

### 已具备的良好基础

- `dataset_id` / `dataset_version` 与 `schema_id` / `schema_version` 分离；
- 文档坐标到右手模型坐标的显式变换；
- 实体、负体积、材料、水体、语义关系和场景状态分离；
- 参数来源、可信度、未知项和类型化断言；
- 候选位置、现场条件、探测器型号从坝体几何中外置；
- 虚几何与物理几何显式区分；
- 近场、远场地形具有带头信息的二进制运行时格式；
- GLB、GDML、manifest、控制点和参考射线由统一编译流程生成；
- 编译产物具有哈希、闭合性检查和版本信息。

### 仍建议改进的契约

1. JSON Schema 继续收紧 `additionalProperties`、条件必填字段和数组长度。目前不同几何类型的专属字段仍可组合成无效对象。
2. 将几何类型做成明确的 discriminated union，例如 `type=extrusion_x` 时强制要求 `profile_yz` 与 `x_range/x_ranges`。
3. 统一长度、密度、角度及高程字段的单位声明策略，避免一部分依赖顶层默认单位、一部分字段名携带单位。
4. 为边界包含规则、数值容差、相交材料优先级和退化几何策略增加机器可读版本。
5. 给每个编译组件提供稳定的 `component_id`、`source_entity_id`、材料、角色和 flags；这些字段不应只存在于 manifest 的场景列表中。
6. 在 manifest 中增加 `geometry_ir_version`、编译选项、LOD、场景状态、坐标变换哈希和后端版本。
7. 明确源规格与构建脚本的权威关系。当前发布说明称 `build_spec.py` 是修改入口、`dam_spec.json` 是唯一数据源，容易产生双重权威。建议定义为：构建源代码/输入是 authoring source，发布后的 JSON 是 immutable canonical release。
8. 将 conformance 公差写入基准文件，不由各实现自行选择。
9. 对水体连通、开敞水道裁切、薄层和共面接触增加独立的编译后拓扑检查。
10. 为 schema 和 manifest 使用稳定 URI，而不是仅使用相对文件名作为 `$id`。

## 3. 格式职责

| 层次 | 格式 | 职责 |
| --- | --- | --- |
| Authoring | `build_spec.py`、测绘/CAD/DEM 输入 | 参数派生、来源和人工维护 |
| Canonical release | `dam_spec.json` + schema | 工程几何、语义、状态、来源、未知项 |
| Geometry IR | 新增的版本化中间模型 | 规范化坐标、已解析实例、材料优先级、组件映射 |
| Web runtime | GLB + terrain f32 + runtime manifest | 显示、拾取、快速材料查询和射线 |
| Geant4 exchange | GDML | 冻结场景的材料几何快照 |
| DD4hep assembly | Compact XML + constructor | 探测器、读出、敏感层、conditions 与 DDG4 装配 |
| BIM/GIS exchange | IFC、CityJSON、GeoPackage 等 | 与工程和地理工具交换，不作为计算真值 |

DD4hep XML 不应替代严格 JSON 契约。Compact XML 没有固定 schema，实际语义还依赖 detector constructor；它适合仿真装配，而非保存坝体来源、未知项和工程断言。

## 4. 目标模块边界

```text
dataset registry
      │
      ▼
dataset loader ── schema/version/checksum validation
      │
      ▼
normalized Geometry IR
 ├─ coordinates and transforms
 ├─ material/priority model
 ├─ entity and component index
 ├─ scenario-resolved volumes
 └─ provenance and uncertainty
      │
      ├─ mesh/render backend
      ├─ fast ray backend
      ├─ GDML backend
      └─ DD4hep backend
```

建议源码模块：

```text
src/
├─ datasets/
│  ├─ registry.js
│  ├─ loader.js
│  ├─ validation.js
│  └─ migrations.js
├─ geometry/
│  ├─ coordinates.js
│  ├─ ir.js
│  ├─ materials.js
│  ├─ terrain.js
│  ├─ classifier.js
│  ├─ ray-tracer.js
│  └─ conformance.js
├─ adapters/
│  ├─ dam-spec-v06.js
│  ├─ glb.js
│  ├─ gdml.py
│  └─ dd4hep.py
└─ view/
   └─ geometry-view.js
```

浏览器代码不应重新实现 `compile_spec.py` 的完整 CSG。短期参数几何解释器仅作为迁移兼容层；目标是直接消费编译后组件和专用材料查询结构。

## 5. 地形和射线技术栈

地形高度网格适合 CPU/Web Worker 中的双线性采样；坝体与空腔适合 BVH 三角网格或解析体求交。推荐混合内核：

- 地形：规则高度场 DDA / 二维格网遍历；
- 复杂坝体：编译后的闭合三角网格 + BVH；
- 简单探测器和规则体：解析求交；
- 场景材料：由编译器消解重叠优先级，不在射线循环中重复执行完整 CSG；
- 批量投影：Web Worker；数据规模达到瓶颈后再评估 WebAssembly；
- WebGL/WebGPU 继续负责渲染，只有在大规模批量射线基准证明值得时才承担计算。

C++/WASM 不应作为第一步。先建立纯 JavaScript 的一致性基线、性能剖析和后端接口。Unity/Unreal 也不适合作为当前静态 Web 平台的几何真值或计算核心；若未来需要沉浸式工程演示，可作为 Geometry IR 的额外消费者。

## 6. 分阶段迁移

### 阶段 A：数据契约接入（本轮开始）

- 建立数据集 registry 和版本化目录；
- 同时加载规格、候选点、设备型号、现场条件、compiled manifest 和近场地形；
- 保存状态以数据集版本命名空间隔离；
- 支持 `extrusion_z`、`sweep_y`、虚几何和 steel；
- 快速材料查询接入近场地形；
- 导出结果记录 dataset/schema 版本。

### 阶段 B：纯几何内核

- 从 `app.js` 提取坐标、地形、实体查询、材料分类和射线；
- 不依赖 DOM、Three.js 或当前 UI；
- 使用 Node 测试运行控制点与参考射线；
- 将所有数据集特定边界和水体规则移入适配器或编译产物。

当前已新增 `dist/modules/geometry-kernel.js`，材料点分类不再依赖 DOM 或 Three.js；`scripts/check-geometry-conformance.mjs` 会读取发布包控制点，忽略距地形面小于 5 m 的容差点，并要求材料一致率不低于 99.5%。接入近场和远场采样后，v0.6.1 的结果为 9437 点中 9428 点一致（99.905%）。剩余差异集中在近场网格边缘及参考读取器的连续地形/编译网格差异，应在正式 runtime IR 中消除，不能通过放宽材料规则掩盖。

同一脚本还检查 200 条参考射线。当前 0.05 m 固定步长纯内核的 P95 绝对段长误差为：混凝土 0.35 m、水体近零、岩体 1.15 m、钢材 0 m。迁移期门槛暂定为 0.5/0.5/1.5/0.1 m；其中岩体仍高于发布包编译器约 0.42 m 的基线，说明后续必须使用编译后网格/BVH，而不能把参数解释器当成最终几何内核。

### 阶段 C：编译后运行时

- 加载场景 GLB 的 component metadata；
- 生成面向快速射线的 BVH/材料组件文件；
- 删除 shader 空腔裁切与材料分类的双重实现；
- 视觉、拾取和射线使用相同组件 ID。

### 阶段 D：并行计算

- 投影任务迁入 Web Worker；
- 支持取消、进度、缓存和确定性结果；
- 用真实扫描规模判断是否引入 WASM/BVH SIMD。

### 阶段 E：Geant4/DD4hep

- 以 Geometry IR 为输入生成 GDML 和 DD4hep passive geometry；
- DD4hep 单独描述探测器敏感层、segmentation、readout 和 alignment；
- 用参考射线材料预算和 DDG4 hit 输出做交叉验证。

## 7. 验证门槛

每个新数据集或几何高风险修改至少通过：

1. schema、checksum、dataset/schema 版本一致性；
2. 坐标控制点正反变换；
3. 编译器断言、闭合性和非预期重叠检查；
4. `conformance_points.json` 材料分类；
5. `conformance_rays.json` 各材料段长；
6. 普通坝段、材料交界、封闭空腔、开敞水道、钢闸门和复杂泄洪结构抽查；
7. 典型视角视觉回归；
8. 固定站点投影回归；
9. GLB、快速内核、GDML/DD4hep 的组件 ID 和材料预算对齐。

当前浏览器参数解释器在完成 conformance 自动化前，只能称为“v0.6.1 迁移兼容实现”，不能宣称与发布包编译器等价。

## 8. 本轮实现状态

已完成第一阶段的基础接入：

- `dist/data/datasets.json` 登记默认数据集；
- 导入 v0.6.1 主规格、schema、候选点、设备型号、现场条件、compiled manifest、近场/远场地形头和一致性基准；
- 新增 `dist/modules/dataset-loader.js`，检查数据集引用并读取近场 float32 地形；
- 浏览器材料查询开始使用近场有效地形；
- 近场范围之外自动回退到远场 30 m 地形；
- 材料分类已抽取为无 DOM/Three.js 依赖的纯模块，并接入控制点一致性门槛；
- 200 条参考射线已进入自动回归，分别约束混凝土、水、岩体和钢材路径误差；
- 新增 `extrusion_z`、`sweep_y`、virtual、steel 的兼容处理；
- 候选点从外置文件读取；
- localStorage 与导出结果绑定数据集版本；
- 近场地形按 20 m 显示采样加入场景。

尚未完成：GLB 组件加载、完整水体连通算法、编译后 BVH、conformance 自动测试以及 DD4hep backend。这些是后续重构的优先事项，而不是本轮实现已经具备的能力。

