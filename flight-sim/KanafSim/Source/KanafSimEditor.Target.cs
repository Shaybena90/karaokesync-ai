using UnrealBuildTool;
using System.Collections.Generic;

public class KanafSimEditorTarget : TargetRules
{
	public KanafSimEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.AddRange(new string[] { "KanafCore", "KanafSim" });
	}
}
