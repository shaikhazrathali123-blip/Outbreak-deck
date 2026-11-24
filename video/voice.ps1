# Speaks every scene's narration with the built-in Windows voice into audio/<id>.wav
#   powershell -ExecutionPolicy Bypass -File voice.ps1                     (the explainer, scenes.json)
#   powershell -ExecutionPolicy Bypass -File voice.ps1 -Scenes scenes-v3.json   (the v3 "what's new" video)
param([string]$Scenes = 'scenes.json')
Add-Type -AssemblyName System.Speech
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'audio'
New-Item -ItemType Directory -Force $out | Out-Null
$list = Get-Content (Join-Path $here $Scenes) -Raw -Encoding UTF8 | ConvertFrom-Json
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($s in $list) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice('Microsoft David Desktop')
  $synth.Rate = -1
  $synth.SetOutputToWaveFile((Join-Path $out ($s.id + '.wav')), $fmt)
  $synth.Speak($s.say)
  $synth.Dispose()
  Write-Output ('spoke ' + $s.id)
}
