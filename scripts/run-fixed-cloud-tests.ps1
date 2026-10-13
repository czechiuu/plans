param(
  [string]$NodePath = 'node',
  [string]$BaseUrl = 'https://czechiuu.github.io/plans/'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$configPath = Join-Path $projectRoot '.env.local'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw '缺少 .env.local 中的公开 Supabase 配置。'
}
$public = @{}
foreach ($line in Get-Content -LiteralPath $configPath) {
  if ($line -match '^(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)=(.+)$') {
    if ($public.ContainsKey($Matches[1])) { throw '公开配置项重复。' }
    $public[$Matches[1]] = $Matches[2]
  }
}
if ($public.Count -ne 2) { throw '公开 Supabase 配置不完整。' }
$backend = [Uri]$public['VITE_SUPABASE_URL']
$site = [Uri]$BaseUrl
if ($backend.Scheme -ne 'https' -or $backend.Host -ne 'wnzbtitlvteptkvwhavw.supabase.co' -or
    $backend.AbsolutePath -ne '/' -or $backend.Port -ne 443 -or $backend.Query -or
    $backend.Fragment -or $backend.UserInfo) {
  throw 'Supabase 地址不是本项目。'
}
$publishable = $public['VITE_SUPABASE_PUBLISHABLE_KEY']
if ($publishable.Length -lt 30 -or $publishable -cnotmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
  throw '公开密钥格式无效；仅允许 publishable key。'
}
if ($site.Scheme -ne 'https' -or $site.Host -ne 'czechiuu.github.io' -or $site.AbsolutePath -ne '/plans/') {
  throw '被测网站须为正式发布的 /plans/ 页面。'
}

$choice = Read-Host '仅在两固定账号资料为空时写入合成记录，并只清理本次记录。确认运行请输入 YES'
if ($choice -cne 'YES') { throw '已取消，未连接云端。' }
$meSecure = Read-Host '请输入「我」的密码' -AsSecureString
$wSecure = Read-Host '请输入「W」的密码' -AsSecureString
$mePtr = [IntPtr]::Zero
$wPtr = [IntPtr]::Zero
$oldPublicUrl = [Environment]::GetEnvironmentVariable('SUPABASE_URL','Process')
$oldPublicKey = [Environment]::GetEnvironmentVariable('SUPABASE_PUBLISHABLE_KEY','Process')
$oldBaseUrl = [Environment]::GetEnvironmentVariable('E2E_BASE_URL','Process')
$oldApproval = [Environment]::GetEnvironmentVariable('TEST_FIXED_ACCOUNTS_APPROVED','Process')
$mePlain = $null
$wPlain = $null
$apiExit = 1
$browserExit = 1
try {
  $mePtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($meSecure)
  $wPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($wSecure)
  $mePlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($mePtr)
  $wPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($wPtr)
  if ([string]::IsNullOrWhiteSpace($mePlain) -or [string]::IsNullOrWhiteSpace($wPlain)) {
    throw '密码不能为空。'
  }
  $env:SUPABASE_URL = $public['VITE_SUPABASE_URL']
  $env:SUPABASE_PUBLISHABLE_KEY = $public['VITE_SUPABASE_PUBLISHABLE_KEY']
  $env:E2E_BASE_URL = $BaseUrl
  $env:TEST_FIXED_ACCOUNTS_APPROVED = 'YES'
  $env:TEST_ME_PASSWORD = $mePlain
  $env:TEST_W_PASSWORD = $wPlain
  $mePlain = $null
  $wPlain = $null
  Push-Location -LiteralPath $projectRoot
  try {
    try { & $NodePath 'scripts/verify-cloud.mjs'; $apiExit = $LASTEXITCODE }
    catch { Write-Warning '云端 API 验收无法启动。' }
    try { & $NodePath 'scripts/verify-cloud-browser.mjs'; $browserExit = $LASTEXITCODE }
    catch { Write-Warning '云端浏览器验收无法启动。' }
  } finally { Pop-Location }
} finally {
  if ($mePtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($mePtr) }
  if ($wPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($wPtr) }
  $mePlain = $null; $wPlain = $null
  [Environment]::SetEnvironmentVariable('TEST_ME_PASSWORD',$null,'Process')
  [Environment]::SetEnvironmentVariable('TEST_W_PASSWORD',$null,'Process')
  [Environment]::SetEnvironmentVariable('SUPABASE_URL',$oldPublicUrl,'Process')
  [Environment]::SetEnvironmentVariable('SUPABASE_PUBLISHABLE_KEY',$oldPublicKey,'Process')
  [Environment]::SetEnvironmentVariable('E2E_BASE_URL',$oldBaseUrl,'Process')
  [Environment]::SetEnvironmentVariable('TEST_FIXED_ACCOUNTS_APPROVED',$oldApproval,'Process')
}
if ($apiExit -ne 0 -or $browserExit -ne 0) { exit 1 }
exit 0
