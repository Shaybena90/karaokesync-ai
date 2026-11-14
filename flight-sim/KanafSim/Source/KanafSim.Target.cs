using UnrealBuildTool;
using System.Collections.Generic;

public class KanafSimTarget : TargetRules
{
	public KanafSimTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.AddRange(new string[] { "KanafCore", "KanafSim" });
	}
}
