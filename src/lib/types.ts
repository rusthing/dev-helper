export interface TsUnit {
  label: string;
  value: string;
}

export interface TsRep {
  label: string;
  value: string;
}

export interface TsZone {
  name: string;
  id: string;
  offset: string;
  datetime: string;
  weekday: string;
}

export interface TsResult {
  millis: number | null;
  units: TsUnit[];
  reps: TsRep[];
  zones: TsZone[];
}

export interface HashResult {
  algo: string;
  output: string;
}

export interface ColorInfo {
  hex: string;
  hex8: string;
  rgb: string;
  hsl: string;
  r: number;
  g: number;
  b: number;
  a: number;
  error: string | null;
}

export interface CronInfo {
  normalized: string;
  fields: number;
  description: string;
}

export interface JwtParts {
  header: string;
  payload: string;
  signature: string;
  alg: string;
  error: string | null;
}

export interface UrlParts {
  scheme: string;
  host: string;
  port: string;
  path: string;
  fragment: string;
  query: [string, string][];
  error: string | null;
}

