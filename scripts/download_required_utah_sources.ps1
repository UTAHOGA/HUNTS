$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $RepoRoot "data\utah\official_downloads_2026"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Downloads = @(
  @{
    File = "utah_hunt_boundaries_combined.geojson"
    Url  = "https://dwrmapserv.utah.gov/arcgis/rest/services/hunt/Boundaries_and_Tables_for_HuntP/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson"
    Kind = "geojson"
    Note = "UDWR hunt boundary geometry + attributes"
  },
  @{
    File = "utah_hunt_info_mobile.csv"
    Url  = "https://dwrmapserv.utah.gov/arcgis/rest/services/hunt/Boundaries_and_Tables/MapServer/1/query?where=1%3D1&outFields=*&f=csv"
    Kind = "csv"
    Note = "HUNT_NUMBER to BOUNDARYID lookup table"
  },
  @{
    File = "utah_big_game_hunt_table_2025.csv"
    Url  = "https://services.arcgis.com/ZzrwjTRez6FJiOq4/ArcGIS/rest/services/Utah_Big_Game_Hunt_Boundaries_2025/FeatureServer/1/query?where=1%3D1&outFields=*&f=csv"
    Kind = "csv"
    Note = "Big game hunt table rows"
  },
  @{
    File = "utah_elk_multiunit_boundary_lookup_2025.csv"
    Url  = "https://services.arcgis.com/ZzrwjTRez6FJiOq4/ArcGIS/rest/services/Utah_Big_Game_Hunt_Boundaries_2025/FeatureServer/2/query?where=1%3D1&outFields=*&f=csv"
    Kind = "csv"
    Note = "Elk multi-unit hunt to boundary mapping"
  },
  @{
    File = "utah_hunt_boundaries_network_link.kmz"
    Url  = "https://dwrmapserv.utah.gov/dwrarcgis/rest/services/hunt/HUNT_BOUNDARY_KML/MapServer/generateKml?docName=UtahHuntBoundaries&layers=0&layerOptions=nonComposite&f=kmz"
    Kind = "kmz"
    Note = "ArcGIS KML service network-link wrapper"
  },
  @{
    File = "utah_hunt_boundaries_network_link.kml"
    Url  = "https://dwrmapserv.utah.gov/dwrarcgis/rest/services/hunt/HUNT_BOUNDARY_KML/MapServer/generateKml?docName=UtahHuntBoundaries&layers=0&layerOptions=nonComposite&f=kml"
    Kind = "kml"
    Note = "ArcGIS KML service network-link text form"
  }
)

function Save-UrlToFile {
  param(
    [Parameter(Mandatory = $true)] [string]$Url,
    [Parameter(Mandatory = $true)] [string]$Path
  )
  Write-Host "Downloading: $Url"
  Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing
}

foreach ($item in $Downloads) {
  $target = Join-Path $OutDir $item.File
  try {
    Save-UrlToFile -Url $item.Url -Path $target
    Write-Host "Saved: $($item.File)"
  } catch {
    Write-Warning "Failed: $($item.File) :: $($_.Exception.Message)"
  }
}

$canonicalCsv = Join-Path $RepoRoot "processed_data\hunt_master_canonical_2026_SOURCE_OF_TRUTH_FINAL_COMPLETE_NO_PARTIALS.csv"
$canonicalGeo = Join-Path $RepoRoot "processed_data\statewide_composite_boundaries_2026_FINAL_LOCKED.geojson"

if (Test-Path $canonicalCsv) {
  Copy-Item -LiteralPath $canonicalCsv -Destination (Join-Path $OutDir "hunt_master_canonical_2026.csv") -Force
}
if (Test-Path $canonicalGeo) {
  Copy-Item -LiteralPath $canonicalGeo -Destination (Join-Path $OutDir "statewide_composite_boundaries_2026_FINAL_LOCKED.geojson") -Force
}

$manifest = [ordered]@{
  generated_at_utc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  output_dir       = $OutDir
  files            = @()
}

Get-ChildItem -LiteralPath $OutDir -File | Sort-Object Name | ForEach-Object {
  $manifest.files += [ordered]@{
    name       = $_.Name
    bytes      = $_.Length
    modified   = $_.LastWriteTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
  }
}

$manifestPath = Join-Path $OutDir "download_manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Out-File -LiteralPath $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "Download run complete."
Write-Host "Output folder: $OutDir"
Write-Host "Manifest: $manifestPath"
