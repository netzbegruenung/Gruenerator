import React from "react";

import UploadPage from "./components/UploadPage";
import Header from "@/app/(presentation-generator)/(dashboard)/dashboard/components/Header";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grünerator Slides — KI-Präsentationen",
  description: "KI-gestützte Präsentationen erstellen und bearbeiten.",
};

const page = () => {
  return (
    <div className="relative">
      <Header />
      <div className="flex flex-col items-center justify-center  mb-8">
        <h1 className="text-[64px] font-normal font-unbounded text-[#101323] ">
          KI-Präsentation
        </h1>
        <p className="text-xl font-syne text-[#101323CC]">Wähle ein Design, lege Einstellungen fest und erstelle professionelle Folien.</p>
      </div>

      <UploadPage />
    </div>
  );
};

export default page;
