#include "KanafTerrainProviders.h"

TArray<TSharedRef<IKanafVisualTerrainProvider>>& FKanafTerrainProviderRegistry::Get()
{
	static TArray<TSharedRef<IKanafVisualTerrainProvider>> Providers;
	return Providers;
}
