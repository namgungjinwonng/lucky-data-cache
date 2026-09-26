# LUCKY 45 release APK용 PKCS12 서명키와 GitHub Secret 값을 생성한다.
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\release-signing')
)

$ErrorActionPreference = 'Stop'
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$keystorePath = Join-Path $outputPath 'lucky45-release.p12'
$secretsPath = Join-Path $outputPath 'github-secrets.txt'

if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $secretsPath)) {
    throw "기존 서명 파일이 있습니다. 덮어쓰지 않았습니다: $outputPath"
}

$openssl = Get-Command openssl -ErrorAction Stop
$opensslRoot = Split-Path (Split-Path $openssl.Source -Parent) -Parent
$opensslConfig = Join-Path $opensslRoot 'ssl\openssl.cnf'
if (-not (Test-Path -LiteralPath $opensslConfig)) {
    throw "OpenSSL 설정 파일을 찾지 못했습니다: $opensslConfig"
}
[System.IO.Directory]::CreateDirectory($outputPath) | Out-Null
$temporaryPath = Join-Path $outputPath ('temporary-' + [guid]::NewGuid().ToString('N'))
[System.IO.Directory]::CreateDirectory($temporaryPath) | Out-Null
$privateKeyPath = Join-Path $temporaryPath 'private.pem'
$certificatePath = Join-Path $temporaryPath 'certificate.pem'

$passwordBytes = [byte[]]::new(24)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
$password = [Convert]::ToBase64String($passwordBytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
$alias = 'lucky45'

try {
    & $openssl.Source req -x509 -newkey rsa:4096 -sha256 -days 10000 -nodes -config $opensslConfig `
        -keyout $privateKeyPath -out $certificatePath -subj '/CN=LUCKY 45/O=LUCKY 45/C=KR'
    if ($LASTEXITCODE -ne 0) { throw '인증서 생성에 실패했습니다.' }

    & $openssl.Source pkcs12 -export -name $alias -inkey $privateKeyPath -in $certificatePath `
        -out $keystorePath -passout "pass:$password"
    if ($LASTEXITCODE -ne 0) { throw 'PKCS12 서명키 생성에 실패했습니다.' }

    $base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($keystorePath))
    $secretLines = @(
        "ANDROID_KEYSTORE_BASE64=$base64"
        "ANDROID_KEYSTORE_PASSWORD=$password"
        "ANDROID_KEY_ALIAS=$alias"
        "ANDROID_KEY_PASSWORD=$password"
    )
    [System.IO.File]::WriteAllLines($secretsPath, $secretLines, [System.Text.UTF8Encoding]::new($false))
} finally {
    $resolvedTemporaryPath = [System.IO.Path]::GetFullPath($temporaryPath)
    if ($resolvedTemporaryPath.StartsWith($outputPath + [System.IO.Path]::DirectorySeparatorChar)) {
        Remove-Item -LiteralPath $resolvedTemporaryPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Output "서명키 생성 완료: $keystorePath"
Write-Output "GitHub Secret 값 생성 완료: $secretsPath"
