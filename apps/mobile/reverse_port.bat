@echo off
set DEVICE=emulator-5554
adb -s %DEVICE% reverse tcp:3000 tcp:3000
adb -s %DEVICE% reverse tcp:3001 tcp:3001
adb -s %DEVICE% reverse tcp:3030 tcp:3030
adb -s %DEVICE% reverse tcp:5000 tcp:5000
adb -s %DEVICE% reverse tcp:4001 tcp:4001
adb -s %DEVICE% reverse tcp:4000 tcp:4000
adb -s %DEVICE% reverse tcp:5005 tcp:5005
adb -s %DEVICE% reverse tcp:3008 tcp:3008

set DEVICE=d760819b
adb -s %DEVICE% reverse tcp:3000 tcp:3000
adb -s %DEVICE% reverse tcp:3001 tcp:3001
adb -s %DEVICE% reverse tcp:3030 tcp:3030
adb -s %DEVICE% reverse tcp:5000 tcp:5000
adb -s %DEVICE% reverse tcp:4001 tcp:4001
adb -s %DEVICE% reverse tcp:4000 tcp:4000
adb -s %DEVICE% reverse tcp:5005 tcp:5005
adb -s %DEVICE% reverse tcp:3008 tcp:3008

echo Ports reversed for %DEVICE%
adb -s %DEVICE% reverse --list