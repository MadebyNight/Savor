import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { PanelLeft } from "lucide-react";
import { IconButton } from "./IconButton.jsx";

const SidebarContext = createContext(null);

export function SidebarProvider({ style, children }) {
  const [open, setOpen] = useState(true);
  const [openMobile, setOpenMobile] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile((value) => !value);
    else {
      const nextOpen = !open;
      setOpen(nextOpen);
      document.cookie = `sidebar_state=${nextOpen}; path=/; max-age=604800`;
    }
  }, [isMobile, open]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "b" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  return (
    <SidebarContext.Provider
      value={{ open, openMobile, setOpenMobile, isMobile, toggleSidebar }}
    >
      <div
        data-slot="sidebar-wrapper"
        style={{
          "--sidebar-width": "224px",
          "--sidebar-width-icon": "3rem",
          ...style,
        }}
        className="group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar"
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className = "", children }) {
  const { open, openMobile, setOpenMobile, isMobile } =
    useContext(SidebarContext);

  if (isMobile) {
    return (
      <DialogPrimitive.Root open={openMobile} onOpenChange={setOpenMobile}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="bg-black/10 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <DialogPrimitive.Popup
            data-sidebar="sidebar"
            data-slot="sidebar"
            data-side="left"
            data-mobile="true"
            style={{ "--sidebar-width": "18rem" }}
            className="fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:sm:max-w-sm data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          >
            <div className="sr-only">
              <DialogPrimitive.Title>我的饮食空间</DialogPrimitive.Title>
              <DialogPrimitive.Description>
                食光页面导航
              </DialogPrimitive.Description>
            </div>
            <div className="flex h-full w-full flex-col">{children}</div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={open ? "expanded" : "collapsed"}
      data-collapsible={open ? "" : "offcanvas"}
      data-variant="sidebar"
      data-side="left"
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className="transition-[width] duration-200 ease-linear relative w-(--sidebar-width) bg-transparent group-data-[collapsible=offcanvas]:w-0 group-data-[side=right]:rotate-180 group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
      />
      <div
        data-slot="sidebar-container"
        data-side="left"
        className={`fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l ${className}`}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="bg-sidebar group-data-[variant=floating]:ring-sidebar-border group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 flex size-full flex-col"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function SidebarTrigger() {
  const { toggleSidebar } = useContext(SidebarContext);
  return (
    <IconButton
      type="button"
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      aria-label="切换侧边栏"
      onClick={toggleSidebar}
    >
      <PanelLeft />
    </IconButton>
  );
}

export function SidebarHeader(props) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className="gap-2 p-2 flex flex-col"
      {...props}
    />
  );
}

export function SidebarFooter(props) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className="gap-2 p-2 flex flex-col"
      {...props}
    />
  );
}

export function SidebarContent(props) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className="no-scrollbar gap-0 flex min-h-0 flex-1 flex-col overflow-auto group-data-[collapsible=icon]:overflow-hidden"
      {...props}
    />
  );
}

export function SidebarMenu(props) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className="gap-0 flex w-full min-w-0 flex-col"
      {...props}
    />
  );
}

export function SidebarMenuItem(props) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className="group/menu-item relative"
      {...props}
    />
  );
}

export function SidebarMenuButton({ isActive, className = "", onClick, ...props }) {
  const {isMobile,setOpenMobile} = useContext(SidebarContext);
  return (
    <button
      type="button"
      onClick={event=>{onClick?.(event);if(isMobile)setOpenMobile(false);}}
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size="default"
      data-active={isActive ? "" : undefined}
      aria-current={isActive ? "page" : undefined}
      className={`ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground gap-2 rounded-md p-2 text-left text-sm transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-2 data-active:font-medium peer/menu-button group/menu-button flex w-full items-center overflow-hidden outline-hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate h-8 ${className}`}
      {...props}
    />
  );
}
