# Production OTA Update Deployment Guide

## Prerequisites

1. AWS Account (or alternative cloud provider)
2. AWS CLI installed and configured
3. Code signing certificate (optional but recommended for Windows)

## Step 1: Set Up AWS S3 Bucket

### Create Bucket
```bash
# Create S3 bucket
aws s3 mb s3://your-app-name-updates --region us-east-1

# Enable public access for update files
aws s3api put-bucket-policy --bucket your-app-name-updates --policy file://bucket-policy.json
```

### bucket-policy.json
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-app-name-updates/*"
    }
  ]
}
```

### Optional: Set Up CloudFront CDN
```bash
# Create CloudFront distribution pointing to S3
aws cloudfront create-distribution --origin-domain-name your-app-name-updates.s3.amazonaws.com
```

## Step 2: Configure electron-builder.yml

Update your `electron-builder.yml`:
```yaml
publish:
  provider: s3
  bucket: your-app-name-updates
  region: us-east-1
  acl: public-read
  # Optional: Use CloudFront
  # path: /releases
```

## Step 3: Set Up AWS Credentials

### For CI/CD (GitHub Actions)
Add to repository secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### For Local Development
```bash
aws configure
# Enter your AWS credentials
```

## Step 4: Build and Publish

### Available NPM Scripts

**Build Commands (No Publishing):**
- `npm run build:win` - Build Windows installer only
- `npm run dist:win` - Build Windows distribution without publishing

**Publish Commands:**
- `npm run publish:win` - Build and publish Windows to S3/GitHub (no version bump)
- `npm run publish:all` - Build and publish all platforms (Windows, Mac, Linux)

**Release Commands (Version Bump + Publish):**
- `npm run release` - Bump patch version (1.0.0 → 1.0.1) and publish
- `npm run release:minor` - Bump minor version (1.0.0 → 1.1.0) and publish
- `npm run release:major` - Bump major version (1.0.0 → 2.0.0) and publish

### Command Differences

**`npm run publish:win`**
- Only builds and publishes
- Does NOT change version number
- Use when you've already bumped version manually
- Command: `npm run build && electron-builder --win --publish=always`

**`npm run release`**
- Bumps version number (1.0.0 → 1.0.1)
- Then builds and publishes
- Creates git tag automatically
- Command: `npm version patch && npm run publish:win`

### Typical Workflow

**Option 1: All-in-One (Recommended)**
```bash
# Most common for regular updates
npm run release              # Auto-bumps patch version + publishes
# or
npm run release:minor        # For new features
# or
npm run release:major        # For breaking changes
```

**Option 2: Manual Version Control**
```bash
# Bump version yourself first
npm version patch
# Then publish
npm run publish:win
```

**Option 3: Republish Same Version**
```bash
# Use only when fixing build without code changes
npm run publish:win
```

### First Release (v1.0.0)
```bash
# Set initial version
npm version 1.0.0

# Build and publish to S3
npm run publish:win
```

This uploads to S3:
- `content-portal-1.0.0.exe` (NSIS installer)
- `content-portal-1.0.0-setup.exe` (full installer)
- `latest.yml` (update metadata)

### Subsequent Updates
```bash
# Quick release (recommended)
npm run release

# Or with custom version bump
npm run release:minor  # 1.0.0 -> 1.1.0
npm run release:major  # 1.0.0 -> 2.0.0
```

## Step 5: Testing Updates

### Test Locally Before Publishing
```bash
# Build without publishing
npm run build:win

# Manually upload to S3 test bucket
aws s3 cp dist/content-portal-1.0.1.exe s3://test-updates/
aws s3 cp dist/latest.yml s3://test-updates/

# Point dev-app-update.yml to test bucket
provider: s3
bucket: test-updates
region: us-east-1
```

### Test Production Updates
1. Install v1.0.0 from installer
2. Open app - wait 10 seconds
3. Check console logs for update check
4. Download update when prompted
5. Restart to install
6. Verify version changed in status bar
7. Verify content-orchestrator.exe was updated

## Step 6: CI/CD Automation (GitHub Actions)

Create `.github/workflows/release.yml`:
```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build and publish
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: npm run dist:win -- --publish always
```

## Step 7: Version Management

### Semantic Versioning
- **Patch** (1.0.0 → 1.0.1): Bug fixes, minor updates
- **Minor** (1.0.0 → 1.1.0): New features, backward compatible
- **Major** (1.0.0 → 2.0.0): Breaking changes

### Release Process
```bash
# 1. Make your changes
# 2. Commit changes
git add .
git commit -m "feat: add new feature"

# 3. Bump version
npm version patch -m "Release v%s"

# 4. Push with tags
git push origin main --tags

# 5. Build and publish
npm run dist:win -- --publish always
```

## Step 8: Monitor Updates

### Check S3 Bucket
```bash
# List files
aws s3 ls s3://your-app-name-updates/

# Get latest.yml
aws s3 cp s3://your-app-name-updates/latest.yml -
```

### Check User Analytics
- Track version adoption via your backend
- Log update checks and downloads
- Monitor error rates

## Alternative: GitHub Releases (Free)

If you prefer GitHub Releases instead of S3:

### electron-builder.yml
```yaml
publish:
  provider: github
  owner: your-github-username
  repo: your-repo-name
```

### GitHub Token
Set `GH_TOKEN` environment variable:
```bash
# Windows
$env:GH_TOKEN = "your-github-token"

# Build and publish
npm run dist:win -- --publish always
```

## Security Best Practices

1. **Code Signing**: Sign your Windows executable
2. **HTTPS Only**: Use HTTPS for update server
3. **Checksum Validation**: electron-updater does this automatically
4. **Rollback Plan**: Keep previous versions available
5. **Staged Rollout**: Test with subset of users first

## Troubleshooting

### Updates Not Detected
- Check `latest.yml` is accessible
- Verify version number increased
- Check dev console for updater logs

### Download Fails
- Check S3 permissions (public read)
- Verify bucket policy allows downloads
- Check firewall/antivirus

### Install Fails
- Check user has write permissions
- Verify app isn't running during install
- Check Windows UAC settings

## Cost Estimation (AWS S3)

- Storage: ~$0.023 per GB/month
- Data Transfer: First 1 GB free, then ~$0.09/GB
- Requests: Negligible

Example: 100 MB app, 1000 users/month = ~$9-10/month
