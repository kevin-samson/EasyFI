import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds `.openapi(...)` to every zod schema. Imported by every schema module so the extension is
// applied before any schema is built.
extendZodWithOpenApi(z);

export { z };
