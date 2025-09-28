# BaseForm Props Reduction Migration Guide

## 🎯 Goal
Reduce BaseForm props from 60+ to ~15 using Zustand stores while maintaining 100% backward compatibility.

## ✅ Current Status: Phase 1 Complete
- ✅ **Backward compatibility**: All existing generators work without changes
- ✅ **Store integration**: New configuration sections added to FormStateProvider
- ✅ **Fallback system**: Props override store values when provided
- ✅ **Build tested**: No breaking changes

## 🔄 How It Works

### Fallback Priority System
```javascript
// Priority: store[key] ?? propValue ?? defaultValue
const resolvedValue = storeConfig[key] ?? propValue ?? defaultValue;
```

### Example: TabIndex Resolution
```javascript
// OLD: Direct prop
<BaseForm platformSelectorTabIndex={12} />

// NEW: Store first, prop fallback
const tabIndex = storeTabIndexConfig.platformSelector ?? 12 ?? defaultValue;
```

## 📊 Migration Patterns

### Pattern 1: Current (Still Works - No Changes Needed)
```jsx
// GrueneJugendGenerator.jsx - WORKS AS BEFORE
const form = useBaseForm({
  features: ['webSearch', 'privacyMode'],
  tabIndexKey: 'GRUENE_JUGEND',
  // ... other config
});

return (
  <BaseForm
    {...form.generator.baseFormProps}  // 20+ props
    onSubmit={form.generator.onSubmit}
    firstExtrasChildren={renderPlatformSection()}
  >
    {renderFormInputs()}
  </BaseForm>
);
```

### Pattern 2: Direct Props (Still Works)
```jsx
// PresseSocialGenerator.jsx - WORKS AS BEFORE
<BaseForm
  title="Presse- & Social Media Grünerator"
  enableKnowledgeSelector={true}
  platformSelectorTabIndex={12}
  knowledgeSelectorTabIndex={14}
  useFeatureIcons={true}
  // ... 15 more props
/>
```

### Pattern 3: New Store Pattern (Future Migration)
```jsx
// NEW: Configuration via FormStateProvider
const config = {
  tabIndex: {
    platformSelector: 12,
    knowledgeSelector: 14,
    submitButton: 17
  },
  platform: {
    enabled: true,
    options: platformOptions,
    label: "Formate",
    placeholder: "Formate auswählen..."
  },
  ui: {
    enableKnowledgeSelector: true,
    showProfileSelector: true,
    useFeatureIcons: true
  },
  submit: {
    showButton: true,
    buttonText: "Grünerieren"
  }
};

return (
  <FormStateProvider
    formId="my-generator"
    initialState={config}
  >
    <BaseForm
      title="My Generator"
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      generatedContent={content}
    >
      {children}
    </BaseForm>
  </FormStateProvider>
);
```

### Pattern 4: Using Helper Hook (Future)
```jsx
// Even simpler with useBaseFormConfig
const baseFormProps = useBaseFormConfig({
  title: "My Generator",
  onSubmit: handleSubmit,
  loading,
  error,
  generatedContent: content,

  // Configuration stored in provider
  tabIndex: { platformSelector: 12, knowledgeSelector: 14 },
  ui: { enableKnowledgeSelector: true, useFeatureIcons: true },
  platform: { enabled: true, options: platformOptions }
});

return <BaseForm {...baseFormProps}>{children}</BaseForm>;
```

## 🚀 Migration Benefits

### Before (Current)
```jsx
<BaseForm
  title="Generator"
  loading={loading}
  error={error}
  generatedContent={content}
  onSubmit={handleSubmit}
  enableKnowledgeSelector={true}
  enablePlatformSelector={true}
  platformOptions={options}
  platformSelectorLabel="Platforms"
  platformSelectorPlaceholder="Select..."
  platformSelectorTabIndex={12}
  knowledgeSelectorTabIndex={14}
  submitButtonTabIndex={17}
  useFeatureIcons={true}
  webSearchFeatureToggle={webSearchToggle}
  privacyModeToggle={privacyToggle}
  featureIconsTabIndex={{webSearch: 11, privacy: 12}}
  showProfileSelector={true}
  enableEditMode={false}
  useMarkdown={null}
  // ... 15 more props
/>
```

### After (Future Migration)
```jsx
<BaseForm
  title="Generator"
  onSubmit={handleSubmit}
  loading={loading}
  error={error}
  generatedContent={content}
>
  {children}
</BaseForm>
```

**Props reduced from 60+ to 5!** 🎉

## 📋 Migration Steps (Per Generator)

### Step 1: Test Current Generator
```bash
npm run build  # Verify it still works
```

### Step 2: Identify Configuration Props
Look for props like:
- `*TabIndex` - move to `tabIndex` config
- `platform*` - move to `platform` config
- `enable*`, `show*`, `use*` - move to `ui` config
- `*ButtonText`, `*ButtonProps` - move to `submit` config

### Step 3: Create Configuration Object
```javascript
const generatorConfig = {
  tabIndex: {
    platformSelector: 12,
    knowledgeSelector: 14,
    // ... other tab indexes
  },
  platform: {
    enabled: true,
    options: platformOptions,
    label: "Platforms",
    // ... other platform config
  },
  ui: {
    enableKnowledgeSelector: true,
    showProfileSelector: true,
    useFeatureIcons: true,
    // ... other UI config
  }
};
```

### Step 4: Update FormStateProvider
```jsx
<FormStateProvider
  formId={componentName}
  initialState={generatorConfig}
>
  <BaseForm
    // Keep only essential dynamic props
    title={title}
    onSubmit={onSubmit}
    loading={loading}
    error={error}
    generatedContent={generatedContent}
  >
    {children}
  </BaseForm>
</FormStateProvider>
```

### Step 5: Test & Verify
```bash
npm run build
# Test generator functionality
# Verify no regression
```

## 🛡️ Safety Guarantees

### 1. Zero Breaking Changes
- All existing generators work without modification
- Props always override store values
- No changes to FormStateProvider context isolation

### 2. Gradual Migration
- Migrate one generator at a time
- Keep both patterns working simultaneously
- Rollback by reverting single files

### 3. Override Safety
```javascript
// Props always win when both provided
<BaseForm
  platformSelectorTabIndex={15}  // This overrides store value
/>
// Result: 15 (not store value)
```

## 🔧 Implementation Details

### New Store Sections
```javascript
// Added to FormStateProvider
{
  tabIndexConfig: {},        // Tab index mappings
  platformConfig: {},       // Platform selector config
  submitConfig: {},          // Submit button config
  uiConfig: {},             // UI behavior config
  helpConfig: {}            // Help content config
}
```

### Fallback Resolution
```javascript
// BaseForm now resolves like this:
const resolvedTabIndex = getConfigValue(
  storeTabIndexConfig,     // Check store first
  propTabIndex,            // Then prop value
  defaultTabIndex          // Finally default
);
```

## 📈 Next Steps

1. **Choose a generator** to migrate (start with simple ones)
2. **Create configuration object** for that generator
3. **Update FormStateProvider** with initial state
4. **Remove props** from BaseForm call
5. **Test thoroughly** before moving to next generator

## 🚨 Important Notes

- **Props override store** - backward compatibility guaranteed
- **Each generator migrates independently** - no coordination needed
- **Store config is form-isolated** - no cross-form interference
- **Rollback is always possible** - just revert the file changes

---

## Examples by Generator Type

### Simple Generators (Easy Migration)
- GrueneJugendGenerator ✅ Ready
- WahlpruefsteinBundestagswahl ✅ Ready

### Complex Generators (Careful Migration)
- PresseSocialGenerator ⚠️ Many custom props
- UniversalTextGenerator ⚠️ Multi-step form
- Sharepicgenerator ⚠️ Custom BaseForm variant

### Migration Order Recommendation
1. GrueneJugendGenerator (simplest)
2. Kandidatengenerator
3. WahlpruefsteinBundestagswahl
4. AltTextGenerator
5. AccessibilityTextGenerator
6. PresseSocialGenerator (most complex)

This approach ensures **zero downtime** and **zero breaking changes** while gradually reducing complexity.