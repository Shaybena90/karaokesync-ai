using UnrealBuildTool;

// Engine-independent simulation core (pure C++17, no UObjects). The same sources are compiled
// by CMake in core-tests/ for automated testing outside Unreal.
public class KanafCore : ModuleRules
{
	public KanafCore(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.NoPCHs;
		bUseUnity = false;
		bEnableExceptions = false;
		PublicDependencyModuleNames.AddRange(new string[] { "Core" });
	}
}
