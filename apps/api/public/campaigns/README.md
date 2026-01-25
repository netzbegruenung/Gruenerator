# Campaign Assets

This directory contains campaign-specific assets (images, decorations) for campaign sharepics.

## Directory Structure

Each campaign should have its own subdirectory:

```
campaigns/
├── christmas2025/
│   ├── bg_snow.png           (1080x1350px - main background)
│   ├── bg_fireplace.png      (1080x1350px - alternative background)
│   └── snowflake.png         (decoration element)
└── europawahl2025/
    ├── bg_eu_stars.png       (1080x1350px)
    └── decoration_flag.png
```

## Image Requirements

### Background Images

- **Dimensions**: 1080x1350px (Instagram portrait format)
- **Format**: PNG or JPG
- **Size**: Keep under 2MB for fast loading
- **Quality**: High-resolution, sharp images

### Decoration Images

- **Format**: PNG with transparency recommended
- **Size**: Varies based on usage (typically 80-200px)
- **Purpose**: Overlay elements like snowflakes, stars, icons

## Adding a New Campaign

1. Create campaign directory: `mkdir christmas2025`
2. Add background images (1080x1350px)
3. Add decoration images (optional)
4. Reference in campaign JSON config:
   ```json
   {
     "canvas": {
       "backgroundImage": "/campaigns/christmas2025/bg_snow.png",
       "decorations": [
         {
           "type": "image",
           "path": "/campaigns/christmas2025/snowflake.png",
           "x": 100,
           "y": 100,
           "width": 80,
           "height": 80,
           "opacity": 0.3
         }
       ]
     }
   }
   ```

## Path References

When referencing assets in campaign JSON configs, use paths relative to `/public`:

- Correct: `/campaigns/christmas2025/bg_snow.png`
- Incorrect: `campaigns/christmas2025/bg_snow.png`
- Incorrect: `/public/campaigns/christmas2025/bg_snow.png`

The generic campaign canvas renderer automatically resolves these paths.
