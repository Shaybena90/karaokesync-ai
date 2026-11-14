#include "KanafSettings.h"

static FKanafBinding B(const TCHAR* Action, std::initializer_list<const TCHAR*> Keys, bool bNeg = false)
{
	FKanafBinding R;
	R.Action = FName(Action);
	for (const TCHAR* K : Keys) R.Keys.Add(FName(K));
	R.bNegate = bNeg;
	return R;
}

// Defaults: keyboard + mouse, Xbox-style gamepad, and generic HOTAS axes (RawInput plugin).
TArray<FKanafBinding> UKanafSettingsSave::DefaultBindings()
{
	return {
		B(TEXT("PitchUp"), {TEXT("S"), TEXT("Gamepad_LeftY_Neg")}),            // stick aft = nose up
		B(TEXT("PitchDown"), {TEXT("W")}),
		B(TEXT("PitchAxis"), {TEXT("Gamepad_LeftY"), TEXT("GenericUSBController_Axis2")}),
		B(TEXT("RollLeft"), {TEXT("A")}),
		B(TEXT("RollRight"), {TEXT("D")}),
		B(TEXT("RollAxis"), {TEXT("Gamepad_LeftX"), TEXT("GenericUSBController_Axis1")}),
		B(TEXT("YawLeft"), {TEXT("Q"), TEXT("Gamepad_LeftShoulder")}),
		B(TEXT("YawRight"), {TEXT("E"), TEXT("Gamepad_RightShoulder")}),
		B(TEXT("YawAxis"), {TEXT("GenericUSBController_Axis4")}),
		B(TEXT("ThrottleUp"), {TEXT("LeftShift"), TEXT("Gamepad_RightTriggerAxis")}),
		B(TEXT("ThrottleDown"), {TEXT("LeftControl"), TEXT("Gamepad_LeftTriggerAxis")}),
		B(TEXT("ThrottleAxis"), {TEXT("GenericUSBController_Axis3")}),
		B(TEXT("Brakes"), {TEXT("SpaceBar"), TEXT("Gamepad_FaceButton_Right")}),
		B(TEXT("ParkingBrake"), {TEXT("P")}),
		B(TEXT("Gear"), {TEXT("G"), TEXT("Gamepad_FaceButton_Top")}),
		B(TEXT("Speedbrake"), {TEXT("B"), TEXT("Gamepad_FaceButton_Left")}),
		B(TEXT("Canopy"), {TEXT("K")}),
		B(TEXT("CameraToggle"), {TEXT("C"), TEXT("Gamepad_RightThumbstick")}),
		B(TEXT("LookHold"), {TEXT("RightMouseButton")}),
		B(TEXT("LookX"), {TEXT("MouseX"), TEXT("Gamepad_RightX")}),
		B(TEXT("LookY"), {TEXT("MouseY"), TEXT("Gamepad_RightY")}),
		B(TEXT("LookCenter"), {TEXT("MiddleMouseButton")}),
		B(TEXT("RadioMenu"), {TEXT("Tab"), TEXT("Gamepad_DPad_Up")}),
		B(TEXT("RadioReply1"), {TEXT("One")}),
		B(TEXT("RadioReply2"), {TEXT("Two")}),
		B(TEXT("RadioReply3"), {TEXT("Three")}),
		B(TEXT("RadioAck"), {TEXT("T"), TEXT("Gamepad_DPad_Right")}),
		B(TEXT("RadioRepeat"), {TEXT("Y"), TEXT("Gamepad_DPad_Left")}),
		B(TEXT("RadioChannel"), {TEXT("U"), TEXT("Gamepad_DPad_Down")}),
		B(TEXT("InstrumentLights"), {TEXT("N")}),
		B(TEXT("ResetFlight"), {TEXT("R")}),
		B(TEXT("Pause"), {TEXT("Escape"), TEXT("Gamepad_Special_Right")}),
		B(TEXT("Help"), {TEXT("F1")}),
		B(TEXT("ControlMode"), {TEXT("F2")}),
	};
}
