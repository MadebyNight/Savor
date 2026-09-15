package com.shiguang.mealplanner;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalDataPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
