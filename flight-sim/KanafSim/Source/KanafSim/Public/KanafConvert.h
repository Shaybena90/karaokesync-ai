// Conversions between the core's frames and Unreal's.
// Core world frame: local NED (x north, y east, z down), metres.
// Unreal world: X = north, Y = east, Z = up (left-handed), centimetres. With this mapping no
// mirroring is needed: UE yaw = true heading, UE pitch = nose-up pitch, UE roll = right-wing-down.
#pragma once
#include <string>

#include "CoreMinimal.h"
#include "Kanaf/MathTypes.h"

namespace KanafConv
{
	inline FVector NedToUe(const kanaf::Vec3& n) { return FVector(n.x * 100.0, n.y * 100.0, -n.z * 100.0); }
	inline kanaf::Vec3 UeToNed(const FVector& v) { return kanaf::Vec3(v.X / 100.0, v.Y / 100.0, -v.Z / 100.0); }
	// Body frame (x fwd, y right, z down, metres) -> actor-local UE (X fwd, Y right, Z up, cm)
	inline FVector BodyToLocal(const kanaf::Vec3& b) { return FVector(b.x * 100.0, b.y * 100.0, -b.z * 100.0); }
	inline FRotator AttToUe(const kanaf::Quat& q)
	{
		double Phi, Theta, Psi;
		q.toEuler(Phi, Theta, Psi);
		return FRotator(Theta * kanaf::kRad2Deg, Psi * kanaf::kRad2Deg, Phi * kanaf::kRad2Deg);
	}
	inline FString ToF(const std::string& S) { return FString(UTF8_TO_TCHAR(S.c_str())); }
	inline FText ToT(const std::string& S) { return FText::FromString(ToF(S)); }
	inline std::string ToStd(const FString& S) { return std::string(TCHAR_TO_UTF8(*S)); }
}
