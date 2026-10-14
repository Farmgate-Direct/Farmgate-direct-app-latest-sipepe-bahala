export const uploadValidIDAsync = async (uri: string) => {
  if (!uri) {
    const error: any = new Error("Missing valid ID image.");
    error.code = "valid-id/missing-image";
    throw error;
  }

  try {
    const data = new FormData();

    data.append("file", {
      uri,
      type: "image/jpeg",
      name: "upload.jpg",
    } as any);

    data.append("upload_preset", "farmgate_validids");

    const response = await fetch(
      "https://api.cloudinary.com/v1_1/dc9jkdgaf/image/upload",
      {
        method: "POST",
        body: data,
      }
    );

    if (!response.ok) {
      const error: any = new Error(
        `Valid ID upload failed (HTTP ${response.status}). Check your connection and try again.`
      );
      error.code = "valid-id/upload-failed";
      throw error;
    }

    const file = await response.json();

    if (!file?.secure_url) {
      const error: any = new Error(
        file?.error?.message ||
          "Valid ID upload failed. Please try a different image."
      );
      error.code = "valid-id/upload-failed";
      throw error;
    }

    return file.secure_url as string;
  } catch (error: any) {
    console.log(error);
    // Network fetch failure (offline) — bigyan ng malinaw na code
    // para sa toast imbes na generic message lang.
    if (!error?.code) {
      error.code = "valid-id/upload-failed";
    }
    throw error;
  }
};
