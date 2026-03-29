"use client";

import Wrapper from "@/components/Wrapper";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
const Header = () => {
  const pathname = usePathname();
  return (
    <div className="w-full  sticky top-0 z-50 py-7 ">
      <Wrapper className="px-5 sm:px-10 lg:px-20">
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-3">
            {/* {(pathname !== "/upload" && pathname !== "/dashboard") && <BackBtn />} */}
            <Link href="/dashboard" onClick={() => trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/dashboard" })}>
              <img
                src="/logo-with-bg.png"
                alt="Presentation logo"
                className="h-[40px] w-[40px]"
              />
            </Link>
          </div>

        </div>
      </Wrapper>
    </div>
  );
};

export default Header;
