import Lean

open Lean

def parts : List String := [".olean", ".olean.private", ".olean.server", ".ir", ".ir.sig"]

def environment (header : String) : IO Environment := do
  initSearchPath (← findSysroot)

  let modules := (← IO.FS.lines header).toList.filterMap fun line =>
    match (line.splitOn " ").filter (· ≠ "") with
    | ["import", name] => some ({ module := name.toName } : Import)
    | _ => none

  importModules modules.toArray {}

def exportPremises (out header : String) : IO Unit := do
  let env ← environment header
  let mut declarations : Array Json := #[]
  let mut skipped := 0

  for (name, info) in env.constants.toList do
    let usable := match info with
      | .thmInfo _ | .defnInfo _ => true
      | _ => false

    if usable && !name.isInternal then
      try
        let type := (← PrettyPrinter.ppExprLegacy env {} {} {} info.type).pretty

        if type.length ≤ 2400 then
          declarations := declarations.push <| Json.mkObj [
            ("name", toJson name.toString),
            ("type", toJson type),
            ("refs", toJson <| info.type.getUsedConstants.map Name.toString)]
      catch _ => skipped := skipped + 1

  let toolchain := (← IO.FS.readFile "lean-toolchain").trimAscii.toString
  let version := (toolchain.splitOn ":").getLast!
  let manifest ← IO.ofExcept <| Json.parse (← IO.FS.readFile "lake-manifest.json")
  let packages ← IO.ofExcept <| (manifest.getObjVal? "packages").bind Json.getArr?

  let some mathlib := packages.find? (fun package => match package.getObjValAs? String "name" with
      | .ok name => name == "mathlib"
      | .error _ => false)
    | throw <| IO.userError "Mathlib is missing from the manifest"

  let catalog := Json.mkObj [
    ("lean", toJson version),
    ("mathlib", toJson <| ← IO.ofExcept <| mathlib.getObjValAs? String "inputRev"),
    ("revision", toJson <| ← IO.ofExcept <| mathlib.getObjValAs? String "rev"),
    ("header", toJson <| ← IO.FS.readFile header),
    ("declarations", toJson declarations)]

  if let some dir := (out : System.FilePath).parent then IO.FS.createDirAll dir

  IO.FS.writeFile out catalog.compress
  IO.println s!"{declarations.size} premise signatures; {skipped} unprintable declarations skipped"

def main : List String → IO Unit
  | ["--premises", out, header] => exportPremises out header
  | [out, header] => do
    let env ← environment header
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
  | _ => throw <| IO.userError "usage: Prune [--premises] <out> <header>"
