# Using the planning app

User guide to the main page of the muography deployment evaluation app: what each part of the screen does and how to work with it. The app estimates what a muon detector would record at a station; it is a planning aid for comparing positions, poses and deployments, not a construction or safety assessment ([Result interpretation](RESULT_INTERPRETATION.md) explains what the numbers mean and do not mean).

- [Screen layout](#screen-layout)
- [Header](#header)
- [Left sidebar](#left-sidebar)
- [3D view](#3d-view)
- [Right sidebar: 点位 (the current detector)](#right-sidebar-点位-the-current-detector)
- [Right sidebar: 多站 (several stations)](#right-sidebar-多站-several-stations)
- [Demonstration mode](#demonstration-mode)
- [Keyboard and touch](#keyboard-and-touch)
- [Where your work is kept](#where-your-work-is-kept)

Related guides: [Stations, deployments and studies](STATIONS_AND_DEPLOYMENTS.md) (the left sidebar in detail) · [Result interpretation](RESULT_INTERPRETATION.md) · [Projection workflow](PROJECTION_WORKFLOW.md) (dataset inspection page).

## Screen layout

```text
┌ header: title · 数据配置 · 数据集检查 · 设备参数设置 · 导入方案 · 导出方案 ─────────────────┐
│ left sidebar      │ 3D view                                         │ right sidebar           │
│ 观察视图           │ 图层 · chip bar (视锥 射线 后方来向 覆盖 其他点位 切面) │ [点位] [多站]           │
│ 我的点位           │                                                 │ 当前探测器               │
│ 数据集建议位置      │        model, detectors, coverage               │ 预期投影结果             │
│ 部署组合           │                                 ▶ 演示模式 (top right)│ 专家诊断                │
│ 工作方案           │ axis legend · scale bar               axis triad│                         │
└ status bar: detector model, readout, field of view, geometry release, response ───────────────┘
```

The ◀ / ▶ tabs on the inner edges of the sidebars fold them away to give the 3D view more room. The app is designed for desktops and tablets (width ≥ 768 px); on phones a notice says the layout is limited.

## Header

| Control | What it does |
|---|---|
| **数据配置 ▾** | Choose the **发布版本** (dataset release), the **几何后端** (geometry backend) and the **冻结工况** (frozen scenario, e.g. a water level), then **载入所选配置**. Each release keeps its own saved stations. |
| **数据集检查** | Opens the dataset inspection page on the same release and scenario: geometry, reference lines and finite-model checks ([Projection workflow](PROJECTION_WORKFLOW.md)). |
| **设备参数设置** | The detector: sensitive width and height, strip pitch and count, layer spacing (geometry); layer efficiency, angular flux model, dead-time loss, angular resolution, systematic error and **曝光时间 / 天（全方案）** (response). **应用到当前点位** changes the current detector only; **应用到全部点位** sets it on every saved station. The exposure always applies to all stations. |
| **导入方案** | Merges a workspace file (or an older plan file) into your saved stations and deployments ([details](STATIONS_AND_DEPLOYMENTS.md#sharing-export-and-import)). |
| **导出方案 ▾** | Saves 整个工作区, 勾选显示的点位 or 当前部署组合 as a file, or shows the workspace as copyable text. |

## Left sidebar

- **观察视图** (top): camera presets: 透视, 上游正视, 典型横剖面, 坝顶俯视.
- **我的点位**: your saved stations, grouped by site. Click one to make it the current detector; tick **显示** to show it in 3D and in 多站.
- **数据集建议位置**: the dataset's candidate positions to inspect and add.
- **部署组合**: named groups of stations: ＋ to create, click to show (click again to clear), ⋯ to edit members, rename, copy, export or delete.
- **工作方案**: studies, read-only for now.

All of this is explained step by step in [Stations, deployments and studies](STATIONS_AND_DEPLOYMENTS.md).

## 3D view

**Moving the camera.** Drag with the left mouse button to rotate, with the right button to pan; scroll to zoom. The view only redraws when something changes.

**The current detector** is drawn in pink, with two handles while it is selected:
- the **centre handle** moves it horizontally (hold **Shift** to move it vertically);
- the **handle at the tip of the axis line** aims it.

Changes preview live and are applied when you release. They edit the current detector only; save them in the right sidebar.

**Right-click** (or long-press on a touch screen) on the model:

| Menu item | Effect |
|---|---|
| **瞄准此处** | Points the current detector at that point (sets 方位角 and 仰角). |
| **放到此处** | Moves the current detector there; on a gallery or other cavity it is placed inside, just above the floor. |

A right-drag pans without opening the menu.

**Coverage readout.** With coverage on, hover a shaded surface to see which line of the projection it falls on and its counts per steradian; click it to open that pixel in the projection.

**图层 ▾** (top left) holds the geometry layers:
- near-field terrain and rock;
- dam concrete, with its transparency;
- the subject's feature groups (galleries, shafts and so on), expandable to single features;
- upstream and downstream water.

Hidden layers never change any result.

**Chip bar** (top): the viewing aids. Each changes the display only.

| Chip | Effect |
|---|---|
| **视锥** | The detector's axis and field of view. Its **▾** offers **视场棱线** (edge lines, in each station's colour) and **实心视锥** (a translucent pyramid). |
| **射线** | Shows, in 3D, the ray of the projection pixel you hover or pin, coloured by material. |
| **后方来向** | Shows or hides what the lines coming from behind the detector record, in the projection, coverage, field-of-view edges and 多站 numbers ([details](RESULT_INTERPRETATION.md#lines-from-behind-the-detector-后方来向)). |
| **覆盖 ▾** | Shades the surfaces the detector sees. **几何视场** shows the field of view; **物理（计数/sr）** shows expected counts per steradian. With other stations shown, **多站物理** offers multi-view maps: number of usable views, their angular spread, an overall class, the dominant station, or total counts, with the thresholds next to it. Options: shade shown features, emphasise the core field of view, include terrain and water. |
| **其他点位 (n)** | Shows the stations ticked in 我的点位 (up to eight) next to the current detector, each in its own colour. The number is how many are ticked. |
| **切面 ▾** | A slice plane through the interior (horizontal, or perpendicular to X or Y) with a position slider. It shows only solid material and carries the same coverage shading. |

**▶ 演示模式** (top right; bottom right on tablets) opens [demonstration mode](#demonstration-mode).

The **axis legend** (bottom left) names the model axes and the origin. The **scale bar** (top left) and the **axis triad** (bottom right) follow the camera.

## Right sidebar: 点位 (the current detector)

The **点位** tab is about the current detector. With none selected, it asks you to choose a station on the left.

**当前探测器**
- Name, position **X / Y / Z** (model frame, metres), **方位角** (azimuth, from X+ towards Y+) and **仰角** (elevation), each with a slider or a number field.
- **在模型上点选位置**: click the model to place the detector there (inside a cavity when you click one).
- **Status line**: where the detector comes from and whether it has unsaved edits, e.g. "与点位「…」一致", "来自「…」· 已修改，未保存" or "查看建议位置「…」".
- **撤销修改**: discards unsaved edits.
- **存为新点位** (or **加入我的点位** while inspecting a suggestion) saves it as a station; **更新点位** writes edits back to its station.

**预期投影结果**: the expected projection, in the detector's own slope space.
- **Summary line**: total counts over the exposure and the weighted transmission, with **导出结果** to save the full result as a file.
- **Modes**: **预计计数** (expected counts) and **透射率** (transmission). **结构显著度** is not available on the current geometry.
- **The map**: sx (local right) horizontally and sy (local up) vertically. Below the white horizon line, counts come from the sky **behind** the detector (后方来向).
- **Hover a pixel** to read its counts, transmission, column density and the materials and features its ray crosses. A depth-profile bar shows the ray from the detector outwards, and the 射线 chip draws it in 3D.
- **Click a pixel** to pin it (click again to unpin). **侧视射线** then turns the 3D camera to look at that ray side-on.
- **统计精度线**: contour lines where the counting error 1/√N is 10 % (dashed) and 5 % (solid). They move with the exposure.
- **构件识别轮廓**: outline chosen features (galleries, concrete, …) on the map. A feature's outline encloses the pixels whose ray runs through it for longer than the **阈值** (threshold, m). **其他构件…** adds any other feature.

**专家诊断** (closed by default) adds numeric layers to the map: material-contribution contours and raw transmission contours. They are for checking, not for comparing between views.

## Right sidebar: 多站 (several stations)

The **多站** tab summarises exactly the stations shown in 3D: the current detector plus the ticked stations, while **其他点位** is on. Its badge shows how many. If no other stations are shown, it offers **显示其他点位**.

- **多站总览**: one row per recognised target, showing how many stations see it and how well it is covered from several angles. Expand a row for each station's numbers; click a station name to make it the current detector. It is a planning reference, not a reconstruction quality guarantee.
- **各点位投影**: one card per station with its projection on a common colour scale (预计计数 or 透射率), counts and transmission. Hover a card for pixel values. Its **显示** box takes the station out of, or back into, the shown set; its name makes it the current detector.
- **方案比较**: compares the shown stations from their cached results. **导出比较 v1** saves the comparison; **重放比较** reloads one.

## Demonstration mode

A clean, full view of the 3D scene for presenting, with a caption, legend and limitations footnote that also appear in every screenshot.

| Control | Effect |
|---|---|
| View presets, **保存视角** | Choose a camera view, or save the current one under a name. |
| **图例**, **说明** | Show or hide the legend and the footnote. |
| **截图** | Saves a PNG with caption, legend and footnote. |
| Animation choice, **录制动画** | Records a short WebM video: a guided tour of the saved views (导览动画) or one orbit (环绕一周). |
| **退出演示** | Leaves demonstration mode (or press **Esc**); **← / →** step through the views. |

## Keyboard and touch

| Key | Effect |
|---|---|
| **C** | Toggle 视锥 |
| **R** | Toggle 射线 |
| **V** | Toggle 覆盖 (back to the last style) |
| **← / →** | Azimuth −1° / +1° (**Shift**: 5°) |
| **↑ / ↓** | Elevation +1° / −1° (**Shift**: 5°) |
| **Esc** | Leave demonstration mode; close a dialog |

Shortcuts are off while you type in a field, while a dialog is open, and in demonstration mode (where ← / → step through the views).

On touch screens:
- drag with one finger to rotate and pinch to zoom;
- long-press for the right-click menu;
- controls are larger and the viewport tools do not fade.

From 721 to 1100 px wide, the right sidebar slides over the 3D view from its edge tab.

## Where your work is kept

- **Saved stations, deployments and studies** are kept in your browser, separately for each dataset release. Use **导出方案** to keep a copy or to share it.
- **Session state** is remembered per browser: the current detector, the ticks, the exposure, the display options and the camera views of demonstration mode. It is never part of an exported file.
- **Older saved data** is converted once, automatically, the first time you open a release; the old data stays as a backup.
- **Results** are recomputed from the inputs whenever they change. Display options never change a result.
