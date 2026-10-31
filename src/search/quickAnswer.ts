/**
 * Instant answers shown above search results, Spotlight-style: arithmetic
 * ("12*(3+4)", "15% of 80", "sqrt 2") and unit conversions ("5 km to mi",
 * "72 f in c"). Everything is computed locally.
 */

export interface QuickAnswer {
  /** What was understood, e.g. "5 km to mi". */
  expression: string;
  /** The answer, ready to copy. */
  value: string;
  kind: "math" | "convert";
}

// --- Arithmetic -------------------------------------------------------------

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
  abs: Math.abs,
  round: Math.round,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = { t: "num"; v: number } | { t: "op"; v: string } | { t: "fn"; v: string };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?|\.\d+)|([a-z]+)|(\*\*|[-+*/^%()×÷x]))/gy;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    m = re.exec(src);
    if (!m) return null;
    pos = re.lastIndex;
    if (m[1]) tokens.push({ t: "num", v: parseFloat(m[1].replace(",", ".")) });
    else if (m[2]) {
      if (m[2] === "x") tokens.push({ t: "op", v: "*" });
      else if (m[2] in FUNCTIONS) tokens.push({ t: "fn", v: m[2] });
      else if (m[2] in CONSTANTS) tokens.push({ t: "num", v: CONSTANTS[m[2]] });
      else if (m[2] === "of") tokens.push({ t: "op", v: "of" });
      else return null;
    } else if (m[3]) {
      const op = m[3] === "×" ? "*" : m[3] === "÷" ? "/" : m[3] === "**" ? "^" : m[3];
      tokens.push({ t: "op", v: op });
    }
    while (pos < src.length && src[pos] === " ") pos++;
  }
  return tokens;
}

/** Recursive-descent evaluation; returns null for anything malformed. */
function evaluate(tokens: Token[]): number | null {
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;

  // expr := term (('+'|'-') term)*
  const expr = (): number | null => {
    let left = term();
    while (left !== null && (isOp("+") || isOp("-"))) {
      const op = tokens[i++].v;
      // "200 + 10%" adds ten percent of 200 (postfix already made it 0.1).
      let right = term();
      if (right === null) return null;
      if (tokens[i - 1]?.t === "op" && tokens[i - 1].v === "%") {
        right = left * right;
      }
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };
  // term := power (('*'|'/'|'of') power)*
  const term = (): number | null => {
    let left = power();
    while (left !== null && (isOp("*") || isOp("/") || isOp("of"))) {
      const op = tokens[i++].v;
      const right = power();
      if (right === null) return null;
      left = op === "/" ? left / right : left * right;
    }
    return left;
  };
  // power := unary ('^' power)?
  const power = (): number | null => {
    const base = unary();
    if (base !== null && isOp("^")) {
      i++;
      const exp = power();
      return exp === null ? null : Math.pow(base, exp);
    }
    return base;
  };
  // unary := '-' unary | postfix
  const unary = (): number | null => {
    if (isOp("-")) {
      i++;
      const v = unary();
      return v === null ? null : -v;
    }
    if (isOp("+")) {
      i++;
      return unary();
    }
    return postfix();
  };
  // postfix := primary '%'?   ("15%" = 0.15 unless it's "15% of x")
  const postfix = (): number | null => {
    const v = primary();
    if (v !== null && isOp("%")) {
      i++;
      return v / 100;
    }
    return v;
  };
  const primary = (): number | null => {
    const tok = tokens[i++];
    if (!tok) return null;
    if (tok.t === "num") return tok.v;
    if (tok.t === "fn") {
      const arg = isOp("(") ? primary() : unary();
      return arg === null ? null : FUNCTIONS[tok.v](arg);
    }
    if (tok.t === "op" && tok.v === "(") {
      const v = expr();
      if (!isOp(")")) return null;
      i++;
      return v;
    }
    return null;
  };

  const result = expr();
  return i === tokens.length ? result : null;
}

function format(n: number): string {
  if (!isFinite(n)) return n > 0 ? "∞" : n < 0 ? "-∞" : "Not a number";
  const rounded = Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0) ? n.toExponential(6) : String(+n.toPrecision(12));
  return rounded;
}

function math(query: string): QuickAnswer | null {
  const src = query.toLowerCase().replace(/^=\s*/, "").trim();
  // Needs an operator or function; a bare number isn't a calculation.
  if (!/[-+*/^%×÷(]|sqrt|sin|cos|tan|ln|log|abs|\bof\b|\d\s*x\s*\d/.test(src)) return null;
  if (/^[-+]?\d+([.,]\d+)?$/.test(src)) return null;
  const tokens = tokenize(src);
  if (!tokens || tokens.length < 2) return null;
  const value = evaluate(tokens);
  if (value === null || isNaN(value)) return null;
  return { expression: query.trim(), value: format(value), kind: "math" };
}

// --- Units ------------------------------------------------------------------

// Factor to the dimension's base unit.
const UNITS: Record<string, { dim: string; factor: number; label: string }> = {};
function unit(dim: string, factor: number, label: string, ...names: string[]) {
  for (const n of names) UNITS[n] = { dim, factor, label };
}
unit("length", 0.001, "mm", "mm", "millimeter", "millimeters", "millimetre", "millimetres");
unit("length", 0.01, "cm", "cm", "centimeter", "centimeters", "centimetre", "centimetres");
unit("length", 1, "m", "m", "meter", "meters", "metre", "metres");
unit("length", 1000, "km", "km", "kilometer", "kilometers", "kilometre", "kilometres");
unit("length", 0.0254, "in", "in", "inch", "inches", '"');
unit("length", 0.3048, "ft", "ft", "foot", "feet", "'");
unit("length", 0.9144, "yd", "yd", "yard", "yards");
unit("length", 1609.344, "mi", "mi", "mile", "miles");
unit("mass", 0.001, "g", "g", "gram", "grams");
unit("mass", 0.000001, "mg", "mg", "milligram", "milligrams");
unit("mass", 1, "kg", "kg", "kilo", "kilos", "kilogram", "kilograms");
unit("mass", 0.45359237, "lb", "lb", "lbs", "pound", "pounds");
unit("mass", 0.028349523125, "oz", "oz", "ounce", "ounces");
unit("volume", 0.001, "ml", "ml", "milliliter", "milliliters", "millilitre", "millilitres");
unit("volume", 1, "L", "l", "liter", "liters", "litre", "litres");
unit("volume", 3.785411784, "gal", "gal", "gallon", "gallons");
unit("volume", 0.2365882365, "cups", "cup", "cups");
unit("data", 1, "B", "b", "byte", "bytes");
unit("data", 1024, "KB", "kb", "kilobyte", "kilobytes");
unit("data", 1024 ** 2, "MB", "mb", "megabyte", "megabytes");
unit("data", 1024 ** 3, "GB", "gb", "gigabyte", "gigabytes");
unit("data", 1024 ** 4, "TB", "tb", "terabyte", "terabytes");
unit("time", 1, "s", "s", "sec", "secs", "second", "seconds");
unit("time", 60, "min", "min", "mins", "minute", "minutes");
unit("time", 3600, "h", "h", "hr", "hrs", "hour", "hours");
unit("time", 86400, "days", "d", "day", "days");
unit("time", 604800, "weeks", "wk", "week", "weeks");
unit("speed", 1, "m/s", "m/s", "mps");
unit("speed", 1 / 3.6, "km/h", "km/h", "kmh", "kph");
unit("speed", 0.44704, "mph", "mph");
// Temperatures are offsets, handled separately.
const TEMPS: Record<string, string> = {
  c: "°C", "°c": "°C", celsius: "°C",
  f: "°F", "°f": "°F", fahrenheit: "°F",
  k: "K", kelvin: "K",
};

function toCelsius(v: number, u: string) {
  return u === "°F" ? ((v - 32) * 5) / 9 : u === "K" ? v - 273.15 : v;
}
function fromCelsius(v: number, u: string) {
  return u === "°F" ? (v * 9) / 5 + 32 : u === "K" ? v + 273.15 : v;
}

function convert(query: string): QuickAnswer | null {
  const m = query
    .toLowerCase()
    .trim()
    .match(/^(-?\d+(?:[.,]\d+)?)\s*([a-z°/"']+)\s+(?:to|in|into|as|=|->)\s+([a-z°/"']+)$/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(",", "."));
  const [from, to] = [m[2], m[3]];
  if (from in TEMPS && to in TEMPS) {
    const [a, b] = [TEMPS[from], TEMPS[to]];
    const out = fromCelsius(toCelsius(amount, a), b);
    return { expression: `${amount} ${a} to ${b}`, value: `${format(+out.toFixed(2))} ${b}`, kind: "convert" };
  }
  const [a, b] = [UNITS[from], UNITS[to]];
  if (!a || !b || a.dim !== b.dim) return null;
  const out = (amount * a.factor) / b.factor;
  return { expression: `${amount} ${a.label} to ${b.label}`, value: `${format(+out.toPrecision(6))} ${b.label}`, kind: "convert" };
}

export function quickAnswer(query: string): QuickAnswer | null {
  if (query.trim().length < 2) return null;
  return convert(query) ?? math(query);
}
