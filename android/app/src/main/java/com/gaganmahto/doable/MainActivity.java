package com.gaganmahto.doable;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugin that hands the Today summary to the home-screen widget
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(LiveUpdatePlugin.class); // in-app web updates from the website
        super.onCreate(savedInstanceState);
    }
}
