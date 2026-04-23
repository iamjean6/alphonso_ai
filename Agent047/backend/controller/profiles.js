import User from "../model/user.js";

/**
 * Updates or Creates the athlete's physical profile.
 * We use findOneAndUpdate to ensure we only have one document per UID.
 */
export const updateProfile = async (req, res) => {
    const { weight, height, primarySports, goals } = req.body;
    const { uid } = req.user; // From authMiddleware

    try {
        const updatedUser = await User.findOneAndUpdate(
            { uid },
            { 
                weight, 
                height, 
                primarySports, 
                goals 
            },
            { new: true, upsert: true } // Return the new doc and create if not exists
        );

        res.status(200).json({
            message: "Profile updated successfully",
            profile: {
                height: updatedUser.height,
                weight: updatedUser.weight,
                primarySports: updatedUser.primarySports,
                goals: updatedUser.goals
            }
        });
    } catch (error) {
        console.error("Unable to update athlete profile:", error.message);
        res.status(500).json({ message: "Internal server error while saving profile." });
    }
};