import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req) {
  try {
    const { file, fileType } = await req.json();
    console.log("Upload API: Received fileType:", fileType, "file length:", file?.length);

    if (!file) {
      console.error("Upload API: No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const isVideo = fileType?.startsWith("video");
    const resourceType = isVideo ? "video" : "image";
    console.log("Upload API: Uploading to Cloudinary as", resourceType);

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file, {
      resource_type: resourceType,
      folder: "circuit-vision",
    });

    console.log("Upload API: Success, URL:", result.secure_url);
    return NextResponse.json({ url: result.secure_url });
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
