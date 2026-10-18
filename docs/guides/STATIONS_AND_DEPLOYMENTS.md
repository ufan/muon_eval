# Stations, deployments and studies (left sidebar)

User guide for the left sidebar of the planning app (the whole screen is covered in the [user guide](USER_GUIDE.md)): keeping stations, grouping them into deployments, showing them in 3D, and sharing them as files. For reading the results of a station, see [Result interpretation](RESULT_INTERPRETATION.md); for the file format, see [Workspace format](../specs/WORKSPACE_FORMAT.md).

- [The idea in one minute](#the-idea-in-one-minute)
- [Stations (我的点位)](#stations-我的点位)
- [Dataset suggestions (数据集建议位置)](#dataset-suggestions-数据集建议位置)
- [Showing stations in 3D: the ticks](#showing-stations-in-3d-the-ticks)
- [Deployments (部署组合)](#deployments-部署组合)
- [Studies (工作方案)](#studies-工作方案)
- [Sharing: export and import](#sharing-export-and-import)
- [Rules worth knowing](#rules-worth-knowing)
- [Common tasks](#common-tasks)

## The idea in one minute

The app starts as a playground: you place and aim **the current detector (当前探测器)** in the right sidebar and see its projection right away, without setting anything up. When a position and pose is worth keeping, you save it. Saved items build up in the left sidebar:

| Section | What it holds |
|---|---|
| **我的点位** | Every saved station of this dataset release: a position (its site) plus a pose and a detector. |
| **数据集建议位置** | Candidate positions shipped with the dataset, to inspect and copy from. Not saved stations. |
| **部署组合** | Named groups of saved stations that are evaluated together. |
| **工作方案** | Studies. Shown only once one exists; read-only for now. |

Everything is kept in your browser for each dataset release, and can be exported as a file and imported by someone else.

There is always at most one **current detector**: the station you are inspecting or editing. Whatever it is, its row in the left sidebar is highlighted (pink), and clicking that row again deselects it, so no current detector is shown.

## Stations (我的点位)

**Rows.** Each saved station is one row: name, position (X · Y · Z), pose (方位 / 仰角), and its total counts and transmission once computed. Several poses at the same site are grouped under the site, with the position shown once.

**Inspect or edit a station.** Click its row. It becomes the current detector; its position, pose and device settings appear in the right sidebar. Click the highlighted row again to deselect it.

**Change a station.** Edit it in the right sidebar: type values, drag the handles in 3D, or use 瞄准此处 from the right-click menu. Then, under 当前探测器:

| Button | Effect |
|---|---|
| **更新点位** | Writes the changes back to the station. If you moved a station whose site is shared with other poses, you choose **仅此点位另建站址** (move only this one) or **移动整个站址** (move the site with all its poses). |
| **存为新点位** | Keeps the original and saves the edited values as a new station, for example a second pose at the same site. |
| **撤销修改** | Discards the edits (shown only while there are any). |

**Delete a station.** Select it, then press **删除所选点位** at the bottom of the section. The confirmation names the deployments and studies it will be removed from.

**An unsaved current detector** (for example after deleting a station) appears as a pink row marked **未保存** at the top of the list. Save it with 存为新点位, or click it to deselect it.

**合并重复.** If stations with the same position and pose exist (for example copies from older saved studies, or from an imported file), a notice above the list offers to merge them. Each group keeps its first station, and deployments refer to it from then on.

## Dataset suggestions (数据集建议位置)

A folded list under 我的点位 with the dataset's candidate positions. It is unrelated to your saved stations.

- **Inspect:** click a row. It becomes the current detector, labelled **查看中**. The status under 当前探测器 says "查看建议位置「…」· 未加入我的点位". Click the row again to stop inspecting.
- **Add:** press **＋** on the row, or **加入我的点位** under 当前探测器 while inspecting it. It becomes a saved station in 我的点位. If you were inspecting it, the current detector switches to the new station, ready to rename, move or re-aim.

## Showing stations in 3D: the ticks

Every station row has a **显示** tick. The ticked stations are the set you are looking at together:

- they appear in 3D next to the current detector, each in its own colour, while the **其他点位** chip above the 3D view is on (up to eight);
- they are compared and summarised in the right sidebar's **多站** tab.

The line above the list shows how many are ticked. **全选** ticks all; **清空** clears all. Ticking a site group's header ticks all its poses. Ticks are part of your session only; they are not saved into any deployment unless you ask (see below).

## Deployments (部署组合)

A deployment is a named group of saved stations, for example "two galleries plus the south platform".

**Create one.** Press **＋** next to 部署组合. A dialog shows a name field and every saved station (poses grouped under their site), pre-ticked with the stations you currently have ticked. Choose the members and press **创建**.

**Show one.** Click its row. Its stations become the ticks (shown in 3D and in 多站), and its members are listed under the row. **Click the same row again to deactivate it**: nothing is ticked any more, a clean start for trying another combination.

**Change one.** Use the row's **⋯** menu:

| Menu item | Effect |
|---|---|
| **编辑成员** | The same dialog, with the current members ticked; you can rename here too. |
| **重命名 · 复制 · 导出** | Rename, duplicate under a new name, or save as a file. |
| **删除** | Deletes the deployment; its stations stay. The confirmation names any studies that use it. |

**From the ticks.** When a deployment is shown and you change the ticks, the line above the list says the ticks differ from it and offers **更新「…」** (make the ticks its members) and **另存为组合** (save the ticks as a new deployment).

## Studies (工作方案)

A study is one question asked of some deployments, with its own scenes (scenarios) and exposure. Studies come from older saved data or from imported files. Until the study editor arrives they are read-only rows:

- click a row to list its deployments; click a deployment there to show it;
- **⋯** offers **重命名**, **导出** and **删除**. Deleting a study keeps its deployments and stations.

## Sharing: export and import

**导出方案 ▾** (header) writes a self-contained file in the `muography-workspace` format:

| Item | What it writes |
|---|---|
| **整个工作区** | Everything saved for this release. |
| **勾选显示的点位** | The ticked stations. |
| **当前部署组合** | The deployment shown. |
| **以文本显示（可复制）** | The whole workspace as text to copy, for viewers that block downloads. |

A single deployment or study can also be exported from its ⋯ menu. A file always carries everything it refers to (sites, detector settings), so it works on any other computer.

**导入方案** (header) reads a workspace file or an older `muography-plan` file and **merges** it into what you have:
- new items are added and identical ones skipped; the imported stations are then ticked;
- an item that exists here with different content is a conflict, and the import is refused (choosing per conflict comes later);
- a file from another release of the same dataset asks first, because positions are taken over unchanged;
- a file from another dataset is refused.

## Rules worth knowing

- **Position and pose identify a station.** Two saved stations can never have the same position and pose; saving or adding one is refused, naming the station already there. Names are free text and may repeat.
- **Exposure** (设备参数设置 → 曝光时间（全方案）) applies to every station at once; it is not a property of one station.
- **Nothing is saved implicitly.** Inspecting a suggestion, moving the current detector or ticking stations changes nothing in 我的点位 or 部署组合 until you press a save, add or update button.
- **Your data stays in this browser** for each dataset release. Export to keep a copy or to share. Saved studies from older versions are converted once, automatically; the old data is kept as a backup.

## Common tasks

**Build a deployment from scratch**
1. Optional: if a deployment is shown, click it again so nothing is ticked.
2. Inspect suggestions or existing stations, and save the ones you want (＋ or 存为新点位).
3. Tick the stations to evaluate together and check them in 3D and in 多站.
4. Press **＋** next to 部署组合, check the members, name it, and **创建**.

**Try a variant of a deployment**
1. Click the deployment to show it.
2. Change the ticks (add or remove stations).
3. Press **另存为组合** to keep the variant, or **更新「…」** to replace the original.

**Add a second pose at a site**
1. Click the station.
2. Change 仰角 or 方位 in the right sidebar.
3. Press **存为新点位**. The new pose is grouped under the same site.

**Send a deployment to a colleague**
- ⋯ → **导出** on the deployment, then send the file. They use **导入方案**.
