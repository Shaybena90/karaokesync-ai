using UnrealBuildTool;

public class KanafCesium : ModuleRules
{
	public KanafCesium(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PrivateDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "CesiumRuntime", "KanafSim" });
	}
}
