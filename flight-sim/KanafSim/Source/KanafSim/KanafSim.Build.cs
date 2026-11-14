using UnrealBuildTool;

public class KanafSim : ModuleRules
{
	public KanafSim(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] {
			"Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput",
			"Slate", "SlateCore", "ProceduralMeshComponent", "AudioMixer", "KanafCore"
		});
	}
}
