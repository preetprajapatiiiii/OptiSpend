"use client";

import Link from "next/link";
import { Button } from '@/components/ui/button';
import Image from "next/image";
import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
} from "./dialog";

const HeroSection = () => {
  const imageRef = useRef();

  useEffect(() => {
    const imageElement = imageRef.current;

    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const scrollThreshold = 100;

      if (scrollPosition > scrollThreshold) {
        imageElement.classList.add("scrolled");
      } else {
        imageElement.classList.remove("scrolled");
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="pb-20 px-4">
      <div className="container mx-auto text-center">
        <h1 className="text-5xl md:text-8xl lg:text-[105px] pb-6 gradient-title">
            Spend Smarter. <br /> Live Better.
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Optimised spending made effortless...
        </p>

        <div className="flex justify-center space-x-4 mb-10">
          <Link href="/dashboard">
            <Button size="lg" className="px-8">
              Get Started
            </Button>
          </Link>

          {/* Updated Watch Demo Button with Dialog */}
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg" variant="outline" className="px-8">
                Watch Demo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl w-[90vw] p-0 border-none bg-white overflow-hidden">
  <DialogHeader className="p-4 border-b bg-gray-50">
    <DialogTitle className="text-xl font-semibold text-blue-600">
      OptiSpend Application Flow
    </DialogTitle>
  </DialogHeader>
  
  {/* This div is now set to 60% of the viewport height */}
  <div className="relative w-full h-[60vh] bg-white p-2">
    <Image
      src="/flow-diagram.png"
      alt="App Flow Diagram"
      fill
      className="object-contain" // Keeps the whole photo visible within that 60% height
      priority
    />
  </div>
</DialogContent>
          </Dialog>
        </div>

        <div className="hero-image-wrapper">
          <div ref={imageRef} className="hero-image">
            <Image
              src="/banner.jpeg"
              width={1280}
              height={720}
              alt="Dashboard Preview"
              className="rounded-lg shadow-2xl border mx-auto"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;