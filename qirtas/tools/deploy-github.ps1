# deploy-github.ps1 — رفع «قِرطاس» إلى GitHub والتحقق من الجاهزية.
# لا يطلب كلمة مرور: يعتمد على مفتاح SSH المسجَّل في حسابك.
# الاستخدام:  powershell -ExecutionPolicy Bypass -File tools\deploy-github.ps1
#             powershell -ExecutionPolicy Bypass -File tools\deploy-github.ps1 -Push

param(
  [string]$Remote = 'git@github.com:iteih67-bit/qirtas.git',
  [switch]$Push
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path (Get-Location) -Leaf
Write-Host '== قِرطاس → GitHub ==' -ForegroundColor Cyan

Write-Host "`n[1/5] التحقق من مفتاح SSH" -ForegroundColor Yellow
$sshOut = ssh -T git@github.com 2>&1 | Out-String
Write-Host ('  ' + ($sshOut -split "`n")[0].Trim())

Write-Host '[2/5] ضبط remote' -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin $Remote
git remote -v | ForEach-Object { Write-Host ('  ' + $_) }

Write-Host '[3/5] حالة الفرع المحلي' -ForegroundColor Yellow
$branch = (git branch --show-current).Trim()
Write-Host ("  الفرع: $branch | الملفات: " + (git ls-files | Measure-Object).Count)
if ($branch -ne 'main') { Write-Host "  ⚠ الفرع ليس main — شغّل: git branch -M main" -ForegroundColor Red }

Write-Host '[4/5] فحص إمكانية الوصول للمستودع (dry-run)' -ForegroundColor Yellow
$dry = git push --dry-run origin main 2>&1 | Out-String
if ($dry -match 'Repository not found') {
  Write-Host '  ✗ المستودع غير موجود بعد.' -ForegroundColor Red
  Write-Host '    أنشئه فارغًا من: https://github.com/new?name=qirtas' -ForegroundColor White
  Write-Host '    (Owner: iteih67-bit، بلا README/.gitignore/License) ثم أعد تشغيل هذا الأمر.' -ForegroundColor White
  exit 2
}
if ($dry -match 'Everything up-to-date') { Write-Host '  ✓ المستودع موجود وكل شيء مرفوع بالفعل.' -ForegroundColor Green }
else { Write-Host '  ✓ المستودع قابل للوصول.' -ForegroundColor Green }

if (-not $Push) {
  Write-Host "`n[5/5] للتشغيل الفعلي أضف -Push :" -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File tools\deploy-github.ps1 -Push' -ForegroundColor White
  exit 0
}

Write-Host "`n[5/5] رفع main إلى origin" -ForegroundColor Yellow
git push -u origin main
if ($LASTEXITCODE -ne 0) { Write-Host '✗ فشل الرفع — راجع الرسالة أعلاه.' -ForegroundColor Red; exit 1 }

Write-Host "`n✓ تم الرفع. الخطوة الأخيرة يدويًا:" -ForegroundColor Green
Write-Host '  Settings → Pages → Source = GitHub Actions' -ForegroundColor White
Write-Host '  الرابط المتوقع: https://iteih67-bit.github.io/qirtas/' -ForegroundColor White
