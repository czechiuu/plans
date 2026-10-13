param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('me', 'w')]
  [string]$Slot,
  [string]$NodePath = 'node'
)

$ErrorActionPreference = 'Stop'
$adminPtr = [IntPtr]::Zero
$newPtr = [IntPtr]::Zero
$confirmPtr = [IntPtr]::Zero
$exitCode = 1
$failure = 'INPUT_FAILED'

try {
  $admin = Read-Host '输入本项目管理员 secret/service_role 密钥' -AsSecureString
  $new = Read-Host '输入新密码' -AsSecureString
  $confirm = Read-Host '再次输入新密码' -AsSecureString

  $adminPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($admin)
  $newPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($new)
  $confirmPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
  $adminText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr)
  $newText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($newPtr)
  $confirmText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPtr)

  if ([string]::IsNullOrWhiteSpace($adminText) -or $newText.Length -lt 8) {
    $failure = 'INPUT_INVALID'
    throw 'invalid input'
  }
  if (![string]::Equals($newText, $confirmText, [StringComparison]::Ordinal)) {
    $failure = 'PASSWORD_MISMATCH'
    throw 'password mismatch'
  }

  [Environment]::SetEnvironmentVariable('PH_RESET_ADMIN_SECRET', $adminText, 'Process')
  [Environment]::SetEnvironmentVariable('PH_RESET_NEW_PASSWORD', $newText, 'Process')
  $failure = 'NODE_START_FAILED'
  & $NodePath (Join-Path $PSScriptRoot 'reset-fixed-password.mjs') $Slot
  $exitCode = $LASTEXITCODE
} catch {
  Write-Error "RESET_FAILED:$failure" -ErrorAction Continue
} finally {
  [Environment]::SetEnvironmentVariable('PH_RESET_ADMIN_SECRET', $null, 'Process')
  [Environment]::SetEnvironmentVariable('PH_RESET_NEW_PASSWORD', $null, 'Process')
  if ($adminPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr) }
  if ($newPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($newPtr) }
  if ($confirmPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPtr) }
  $adminText = $null
  $newText = $null
  $confirmText = $null
  $admin = $null
  $new = $null
  $confirm = $null
}

exit $exitCode
