/**
 * YAML Front Matter Sanitizer
 * Fixes common YAML parsing issues in markdown files
 */

/**
 * Sanitize YAML front matter to fix common parsing issues
 * Handles malformed block scalars and ensures proper YAML syntax
 */
export function sanitizeYAMLFrontMatter(markdown: string): string {
  // Check if markdown has YAML front matter
  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) {
    // No YAML front matter, but check for --- in the middle of content
    // which Pandoc can mistake for YAML delimiters
    if (markdown.includes('\n---\n') || markdown.includes('\n---\r\n')) {
      console.warn('[YAML Sanitizer] Found --- in content, escaping it')
      // Replace --- that appears on its own line (not at start) with HTML comment
      return markdown.replace(/\n---\n/g, '\n<!-- section break -->\n')
    }
    return markdown
  }

  const lines = markdown.split('\n')
  const yamlEndIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')

  if (yamlEndIndex === -1) {
    // No closing ---, remove malformed YAML and return just content
    console.warn('[YAML Sanitizer] Malformed YAML front matter detected, removing it')
    return lines.slice(1).join('\n')
  }

  // Extract YAML section (between first and second ---)
  const yamlLines = lines.slice(1, yamlEndIndex)
  const contentLines = lines.slice(yamlEndIndex + 1)

  // Check for additional --- in content that might confuse Pandoc
  const sanitizedContent = contentLines.join('\n').replace(/\n---\n/g, '\n<!-- section break -->\n')

  // Try to fix block scalars - the most common issue
  const sanitizedYaml: string[] = []
  let i = 0

  while (i < yamlLines.length) {
    const line = yamlLines[i]

    // Detect block scalar indicators (| or >)
    const blockScalarMatch = line.match(/^(\s*)([\w-]+):\s*([|>])(-|\+)?(.*)$/)

    if (blockScalarMatch) {
      const [, indent, key, , , trailingContent] = blockScalarMatch

      // Block scalar line - ensure it has no trailing content after the operator
      if (trailingContent.trim()) {
        // Invalid: content on same line as block scalar operator
        // Convert to regular quoted string or literal
        console.warn(`[YAML Sanitizer] Fixed invalid block scalar: ${key}`)
        sanitizedYaml.push(`${indent}${key}: "${trailingContent.trim().replace(/"/g, '\\"')}"`)
        i++
        continue
      }

      // Valid block scalar - add it
      sanitizedYaml.push(line)
      i++

      // Collect block content (indented lines following the block scalar)
      const baseIndent = indent.length
      const blockIndent = baseIndent + 2

      while (i < yamlLines.length) {
        const nextLine = yamlLines[i]
        const nextTrimmed = nextLine.trim()

        // Empty line or properly indented content
        if (nextTrimmed === '' || nextLine.startsWith(' '.repeat(blockIndent))) {
          sanitizedYaml.push(nextLine)
          i++
        } else {
          // Less indented - end of block scalar
          break
        }
      }
    } else {
      // Regular key-value pair - check if value needs quoting
      const kvMatch = line.match(/^(\s*)([\w-]+):\s*(.*)$/)

      if (kvMatch) {
        const [, indent, key, value] = kvMatch
        const trimmedValue = value.trim()

        if (trimmedValue && !trimmedValue.startsWith('"') && !trimmedValue.startsWith("'")) {
          // Check if value needs quoting (contains special YAML characters)
          if (
            /[:#{}[\]&*!|>%@`]/.test(trimmedValue) ||
            trimmedValue.startsWith('|') ||
            trimmedValue.startsWith('>')
          ) {
            sanitizedYaml.push(`${indent}${key}: "${trimmedValue.replace(/"/g, '\\"')}"`)
            i++
            continue
          }
        }
      }

      // Keep line as-is
      sanitizedYaml.push(line)
      i++
    }
  }

  // Reconstruct markdown with sanitized YAML and content
  // Use the sanitized content that has --- replaced
  return ['---', ...sanitizedYaml, '---', sanitizedContent].join('\n')
}
