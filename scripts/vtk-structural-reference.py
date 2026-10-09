"""Development-only VTK reference; consumes mesh buffers over stdin, no files/GUI."""
import json
import sys
import vtkmodules.vtkCommonCore as core
import vtkmodules.vtkCommonDataModel as data
from vtkmodules.vtkFiltersCore import vtkFeatureEdges
from vtkmodules.vtkFiltersHybrid import vtkPolyDataSilhouette


def mesh_poly(mesh):
    points = core.vtkPoints()
    points.SetDataTypeToDouble()
    positions = mesh['positions']
    for i in range(0, len(positions), 3):
        points.InsertNextPoint(*positions[i:i + 3])
    triangles = data.vtkCellArray()
    indices = mesh['indices']
    for i in range(0, len(indices), 3):
        triangles.InsertNextCell(3)
        for index in indices[i:i + 3]:
            triangles.InsertCellPoint(index)
    poly = data.vtkPolyData()
    poly.SetPoints(points)
    poly.SetPolys(triangles)
    return poly


def segments(poly):
    ids = core.vtkIdList()
    lines = poly.GetLines()
    lines.InitTraversal()
    result = []
    while lines.GetNextCell(ids):
        for i in range(1, ids.GetNumberOfIds()):
            result.append([list(poly.GetPoint(ids.GetId(i - 1))), list(poly.GetPoint(ids.GetId(i)))])
    return result


request = json.load(sys.stdin)
results = []
for fixture in request['fixtures']:
    for mesh in fixture['components']:
        poly = mesh_poly(mesh)
        feature = vtkFeatureEdges()
        feature.SetInputData(poly)
        feature.FeatureEdgesOn()
        feature.BoundaryEdgesOff()
        feature.NonManifoldEdgesOff()
        feature.ManifoldEdgesOff()
        feature.SetFeatureAngle(request['featureAngleDeg'])
        feature.Update()
        views = []
        for view in fixture['views']:
            silhouette = vtkPolyDataSilhouette()
            silhouette.SetInputData(poly)
            silhouette.SetDirectionToSpecifiedOrigin()
            silhouette.SetOrigin(*view['origin'])
            silhouette.SetEnableFeatureAngle(False)
            silhouette.BorderEdgesOff()
            silhouette.Update()
            views.append({'name': view['name'], 'segments': segments(silhouette.GetOutput())})
        results.append({'fixture': fixture['id'], 'componentId': mesh['componentId'],
                        'featureSegments': segments(feature.GetOutput()), 'views': views})
print(json.dumps({'vtkVersion': core.vtkVersion.GetVTKVersion(), 'results': results}))
