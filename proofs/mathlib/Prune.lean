import Lean
open Lean

def parts : List String := [".olean", ".olean.private", ".olean.server", ".ir", ".ir.sig"]

def main : List String → IO Unit
  | [out, header] => do
    initSearchPath (← findSysroot)
    let modules := (← IO.FS.lines header).toList.filterMap fun line =>
      match (line.splitOn " ").filter (· ≠ "") with
      | ["import", name] => some ({ module := name.toName } : Import)
      | _ => none
    let env ← importModules modules.toArray {}
    let mut bytes := 0
    for name in env.header.moduleNames do
      let base := ((← findOLean name).withExtension "").toString
      let target := (out : System.FilePath) / (name.toString.replace "." "/")
      if let some dir := target.parent then IO.FS.createDirAll dir
      for part in parts do
        let source : System.FilePath := base ++ part
        if ← source.pathExists then
          let data ← IO.FS.readBinFile source
          bytes := bytes + data.size
          IO.FS.writeBinFile (target.toString ++ part) data
    IO.println s!"{env.header.moduleNames.size} modules, {bytes / 1000000} MB"
  | _ => throw <| IO.userError "usage: Prune <out> <header>"
