import { build } from "esbuild";
const out = "/home/runner/workspace/artifacts/api-server/_b.mjs";
await build({
  entryPoints: ["./src/lib/membersPortalDefaults.ts"],
  bundle: true, format: "esm", platform: "node", outfile: out,
  packages: "external", resolveExtensions: [".ts", ".js"],
});
const mod = await import(out);
const lodge = mod.buildStarterPortalConfig("Masonic Lodge", "Friendship Lodge 101");
const rotary = mod.buildStarterPortalConfig("Rotary Club", "Westside Rotary");
const pta = mod.buildStarterPortalConfig("PTA / PTO", "Lincoln Elementary PTA");
const chamber = mod.buildStarterPortalConfig("Chamber of Commerce", "Smalltown Chamber");
const vfw = mod.buildStarterPortalConfig("VFW / American Legion", "Post 123");
const unknown = mod.buildStarterPortalConfig("Other", "Friends of the Park");
console.log("LODGE   types →", lodge.sections.map(s => s.type).join(", "));
console.log("ROTARY  types →", rotary.sections.map(s => s.type).join(", "));
console.log("PTA     types →", pta.sections.map(s => s.type).join(", "));
console.log("CHAMBER types →", chamber.sections.map(s => s.type).join(", "));
console.log("VFW     types →", vfw.sections.map(s => s.type).join(", "));
console.log("OTHER   types →", unknown.sections.map(s => s.type).join(", "));
console.log("\nLODGE welcome →", JSON.stringify(lodge.sections[0], null, 2).slice(0, 300));
process.exit(0);
