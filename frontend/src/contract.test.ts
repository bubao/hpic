import { describe, it, expect } from 'vitest';
// @ts-ignore
import contractData from '../../docs/api-contract.json';
// @ts-ignore
import typesContent from './types.ts?raw';
// @ts-ignore
import apiContent from './api.ts?raw';

interface ContractField {
  name: string;
  json: string;
  goKind: string;
  ts: string;
  tsKind: string;
  omitempty: boolean;
}

interface ContractDTO {
  goType: string;
  tsType?: string;
  fields: ContractField[];
}

interface ContractEndpoint {
  method: string;
  path: string;
  response?: string;
  frontend?: boolean;
}

interface ContractFile {
  schemaVersion: number;
  generatedBy: string;
  dtos: ContractDTO[];
  endpoints: ContractEndpoint[];
}

// 解析 types.ts 中各个 interface 的字段集合（支持嵌套花括号）
function parseTypeScriptInterfaces(content: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const headerRegex = /export\s+interface\s+([A-Za-z0-9_]+)\s*\{/g;
  let headerMatch: RegExpExecArray | null;

  while ((headerMatch = headerRegex.exec(content)) !== null) {
    const interfaceName = headerMatch[1];
    let depth = 1;
    let idx = headerMatch.index + headerMatch[0].length;
    let body = '';

    while (idx < content.length && depth > 0) {
      const char = content[idx];
      if (char === '{') {
        depth++;
        body += char;
      } else if (char === '}') {
        depth--;
        if (depth > 0) body += char;
      } else {
        body += char;
      }
      idx++;
    }

    const fields = new Set<string>();
    const lines = body.split('\n');
    let nestedDepth = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }
      // 仅在顶层字段时提取字段名
      if (nestedDepth === 0) {
        const fieldMatch = /^([a-zA-Z0-9_]+)\s*\??\s*:/.exec(line);
        if (fieldMatch) {
          fields.add(fieldMatch[1]);
        }
      }
      for (const ch of line) {
        if (ch === '{') nestedDepth++;
        if (ch === '}') nestedDepth = Math.max(0, nestedDepth - 1);
      }
    }
    result.set(interfaceName, fields);
  }
  return result;
}

describe('API Contract Mirror (Contract-First)', () => {
  const contract: ContractFile = contractData;

  it('contract file docs/api-contract.json exists and is valid', () => {
    expect(contract.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(contract.dtos.length).toBeGreaterThan(0);
    expect(contract.endpoints.length).toBeGreaterThan(0);
  });

  it('all DTOs mapped to TypeScript match frontend/src/types.ts fields', () => {
    const tsInterfaces = parseTypeScriptInterfaces(typesContent);

    const mappedDTOs = contract.dtos.filter((d) => Boolean(d.tsType));
    expect(mappedDTOs.length).toBeGreaterThan(0);

    for (const dto of mappedDTOs) {
      const tsName = dto.tsType!;
      const tsFields = tsInterfaces.get(tsName);
      expect(tsFields, `Interface ${tsName} should be defined in frontend/src/types.ts`).toBeDefined();

      for (const field of dto.fields) {
        if (!field.json) continue;
        expect(
          tsFields!.has(field.json),
          `DTO ${dto.goType} field '${field.json}' is missing in TypeScript interface ${tsName}`
        ).toBe(true);
      }
    }
  });

  it('all frontend endpoints in contract are referenced in frontend/src/api.ts', () => {
    const frontendEndpoints = contract.endpoints.filter((ep) => ep.frontend);
    expect(frontendEndpoints.length).toBeGreaterThan(0);

    for (const ep of frontendEndpoints) {
      expect(
        apiContent.includes(ep.path),
        `Endpoint ${ep.method} ${ep.path} marked as frontend: true should be called in frontend/src/api.ts`
      ).toBe(true);
    }
  });
});
