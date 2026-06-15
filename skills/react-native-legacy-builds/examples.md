# React Native Legacy Builds — Examples

Code examples for each build fix.

## glog armv7 Patch

```bash
# scripts/postinstall.sh (run on macOS only)
GLOG_SCRIPT="node_modules/react-native/scripts/ios-configure-glog.sh"
if [ -f "$GLOG_SCRIPT" ]; then
    sed -i '' 's/CURRENT_ARCH="armv7"/CURRENT_ARCH="arm64"/' "$GLOG_SCRIPT"
fi
```

```json
// package.json
"scripts": {
  "postinstall": "bash scripts/postinstall.sh"
}
```

## CocoaPods Spaces-in-Path Fix (Podfile post_install)

```ruby
# ios/Podfile
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_phases.each do |phase|
      next unless phase.respond_to?(:shell_script)
      next if phase.shell_script.nil?

      phase.shell_script = phase.shell_script
        .gsub('bash -l -c "$PODS_TARGET_SRCROOT', 'bash -l "$PODS_TARGET_SRCROOT')
        .gsub('bash -l -c "$PODS_ROOT', 'bash -l "$PODS_ROOT')
    end
  end
end
```

## Clang Warnings Suppression + armv7 Exclusion

```ruby
installer.pods_project.targets.each do |target|
  target.build_configurations.each do |config|
    config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
  end
end

installer.pods_project.build_configurations.each do |config|
  config.build_settings['EXCLUDED_ARCHS[sdk=iphoneos*]'] = 'armv7'
end
```

## FBReactNativeSpec Pre-generation

**In postinstall.sh:**
```bash
GENERATE_SPECS="node_modules/react-native/scripts/generate-specs.sh"
if [ -f "$GENERATE_SPECS" ]; then
    SRCS_DIR="$PROJECT_DIR/node_modules/react-native/Libraries" \
    CODEGEN_MODULES_OUTPUT_DIR="$PROJECT_DIR/node_modules/react-native/React/FBReactNativeSpec/FBReactNativeSpec" \
    CODEGEN_MODULES_LIBRARY_NAME=FBReactNativeSpec \
    bash "$GENERATE_SPECS" 2>&1 || echo "Warning: generate-specs.sh failed (non-fatal)"
fi
```

**In Podfile post_install, skip the build phase:**
```ruby
if target.name == 'FBReactNativeSpec' && phase.respond_to?(:name) && phase.name == '[CP-User] Generate Specs'
  target.build_phases.move(phase, 0)
  phase.shell_script = "echo 'Skipping Generate Specs (pre-generated)'"
  next
end
```

## pbxproj Path Quoting

```diff
- REACT_NATIVE_PATH=$(node --print "require.resolve('react-native/package.json')");
- cd $(dirname $REACT_NATIVE_PATH)/..
+ REACT_NATIVE_PATH=$(node --print "require.resolve('react-native/package.json')");
+ cd "$(dirname "$REACT_NATIVE_PATH")/.."
```

## CI Configuration

```yaml
# .github/workflows/ci.yml
- name: Install dependencies
  run: just ci-install   # npm ci --legacy-peer-deps, no pod install
```

```makefile
# Justfile
install:
    npm install --legacy-peer-deps
    cd ios && pod install

ci-install:
    npm ci --legacy-peer-deps
```

## Device Build from Non-Interactive Shell

```bash
source ~/.zshrc 2>/dev/null; eval "$(fnm env)" && fnm use 16 && npx react-native run-ios --device
```

Run with `run_in_background: true` and `timeout: 600000` to avoid timeout.
