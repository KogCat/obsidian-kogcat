import { z } from 'zod'

// Retained only for settings-schema back-compat: older data.json may carry an
// `mcp.servers` array from the Smart Composer fork. The MCP subsystem itself is
// removed; this just lets stored config parse without loss.
export const mcpServerParametersSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
})
export type McpServerParameters = z.infer<typeof mcpServerParametersSchema>

export const mcpServerToolOptionsSchema = z.record(
  z.string(),
  z.object({
    disabled: z.boolean().optional(),
    allowAutoExecution: z.boolean().optional(),
  }),
)

export const mcpServerConfigSchema = z.object({
  id: z.string(),
  parameters: mcpServerParametersSchema,
  enabled: z.boolean(),
  toolOptions: mcpServerToolOptionsSchema,
})
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>
