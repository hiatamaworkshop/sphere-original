# Inject mock data via wave API
# Uses Sphere's wave endpoint to inject diverse nodes

$mockData = Get-Content "docker_compose_sphere_v1/services/periphery/src/mock/mock_data.json" | ConvertFrom-Json

Write-Host "=== Injecting Mock Data via Wave API ===" -ForegroundColor Cyan
Write-Host "Nodes: $($mockData.Count)" -ForegroundColor Yellow
Write-Host ""

$count = 0
foreach ($node in $mockData) {
    $payload = @{
        summary = $node.summary
        tags = $node.tags
        payload = $node.payload
        flags = $node.flags
        importance = $node.importance
    } | ConvertTo-Json -Compress

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3001/api/wave" -Method Post -Body $payload -ContentType "application/json"
        $count++
        Write-Host "✓ $($node.summary)" -ForegroundColor Green
    } catch {
        Write-Host "✗ $($node.summary): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✓ Injected $count / $($mockData.Count) nodes" -ForegroundColor Cyan
