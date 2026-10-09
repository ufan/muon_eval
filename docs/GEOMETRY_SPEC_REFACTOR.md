# 几何数据与后端架构指导

本文只定义长期有效的数据职责、模块边界、技术选择和验证原则，不记录已完成任务、实施阶段状态或一次运行的结果。

当前模块与后端能力见 [ARCHITECTURE](ARCHITECTURE.md)，未完成工作见 [ROADMAP](ROADMAP.md)，数据集特有坐标见 [GEOMETRY_AND_COORDINATES](GEOMETRY_AND_COORDINATES.md)。参考线/派生资产的专项契约见 [GEOMETRY_REFERENCES](GEOMETRY_REFERENCES.md)。

## 1. 核心原则

坝体应作为显式、可版本化的数据产品加载，不让 UI 同时承担源规格解释、CSG、地形拼接、显示网格、材料分类和射线求交。通用代码不得固化某个坝体的尺寸、坝段数量或测绘坐标。

Authoring 输入负责人工维护与参数派生；发布后的 canonical JSON 是不可变、版本化的几何与语义源。规范化 Geometry IR 及各后端产物必须绑定相同源版本、工况和坐标约定，用共同控制点与参考射线验证。不得把拟议后端描述为已接入能力。

更高层通用接口应由第二个真实坝体数据集验证，不凭单个样例提前建立复杂框架或插件系统。

## 2. 数据契约要求

- 分离 dataset 与 schema 的 ID/版本，使用稳定 schema URI；同数据版本的不同 schema 发布不可混用。
- 显式声明单位、源/模型坐标、高程基准与方位；点和方向分别变换，负行列式必须处理绕向反转。
- 将几何类型定义为 discriminated union，约束专属字段、数组长度、条件必填项和 additionalProperties。
- 分离实体、负体积、材料、水体、场景、候选位置、设备和现场条件；虚几何不得参与物理计算。
- 将材料优先级、边界包含、数值容差及退化策略版本化；保留来源、可信度、未知项和类型化断言。
- 组件使用稳定 ID，并携带材料、角色、flags 和有证据的 source entity 映射；聚合材料归属不能用名称或空间接近猜测。
- Manifest 绑定源摘要、IR/后端版本、编译选项、LOD、工况、坐标变换和资产校验值；声明 authoring source 与 canonical release 的权威关系。
- 将 conformance 公差放入数据集基准，而不是由各实现自行选择；独立检查水体连通、开敞水道、薄层、共面接触和编译后拓扑。

## 3. 格式职责

| 层次 | 格式 | 职责 |
| --- | --- | --- |
| Authoring | `build_spec.py`、测绘/CAD/DEM 输入 | 参数派生、来源和人工维护 |
| Canonical release | `dam_spec.json` + schema | 工程几何、语义、状态、来源、未知项 |
| Geometry IR | 版本化中间模型 | 规范化坐标、已解析实例、材料优先级、组件映射 |
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

建议职责组织（示意，不是当前目录清单）：

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

## 6. 集成依赖与切换规则

数据契约与坐标适配 → 纯几何查询接口 → 编译后运行时与共享显示缓冲 → 主应用计算/状态接入 → 扫描与按需并行化。此顺序描述依赖，不是已完成/未完成清单；具体工作仅在 ROADMAP 中维护。

- 单点评估、批量扫描、比较和导出复用同一计算核心；计算不依赖 DOM 或 Three.js 场景对象。
- 源几何、视觉、材料分类和射线表达同一事实。相机变换、可见性、法线、颜色和显示平滑不得改变材料路径。
- 结果快照绑定完整有效输入；异步取消、缓存和 UI 更新不得让旧结果覆盖新状态。
- 冻结工况与连续环境解析是不同能力；不得用有限快照插值伪造连续水位材料几何。
- 后端切换是显式迁移：分别验证数据集、设备语义、环境、ROI、射线和响应，再修改默认入口；不能因为独立预览可用就自动替换生产后端。
- GDML/DD4hep 作为同源几何的可选后端；探测器敏感层、segmentation、readout 和 alignment 独立装配，用材料预算及仿真输出交叉验证，不扩张快速评估的科学结论。

## 7. 验证原则

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

参数解释器、编译网格及仿真后端必须分别记录适用范围与误差；任何兼容或资格后端不能因通过部分测试而宣称与发布编译器等价。
