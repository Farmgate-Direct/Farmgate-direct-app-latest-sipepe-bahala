const BACKEND_URL = String(
  process.env.EXPO_PUBLIC_BACKEND_URL || ""
).replace(/\/+$/, "");

export const deleteCloudinaryImage =
  async (publicId: string) => {

    try {

      if (!BACKEND_URL) {
        console.log(
          "DELETE IMAGE ERROR:",
          "EXPO_PUBLIC_BACKEND_URL is not configured."
        );
        return;
      }

      const response =
        await fetch(
          `${BACKEND_URL}/delete-image`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              public_id: publicId,
            }),
          }
        );

      const data =
        await response.json();

      console.log(
        "DELETE IMAGE RESPONSE:",
        data
      );

    } catch (error) {

      console.log(
        "DELETE IMAGE ERROR:",
        error
      );

    }

};