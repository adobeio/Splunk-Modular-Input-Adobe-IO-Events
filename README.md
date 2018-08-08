# Setup

1. Set the `SPLUNK_HOME` environment variable to the root directory of your Splunk instance.
2. Download the repository as zip, extract and rename the folder as  `adobe_io_events` for example, and copy the folder to `$SPLUNK_HOME/etc/apps`.
3. Open a terminal at `$SPLUNK_HOME/etc/apps/adobe_io_events/bin/app`.
4. Run `npm install`.
    
    If this step fails.  
    4.1 [Clone the SDK from Github](https://github.com/splunk/splunk-sdk-javascript).  
    4.2 Copy the full `splunk-sdk-javascript` folder to `$SPLUNK_HOME/etc/apps/adobe_io_events/bin/app/node_modules`.  
    4.3 Rename this copied folder as `splunk-sdk`.  
5. Restart Splunk

# Adding an input

1. From Splunk Home, click the Settings menu. Under **Data**, click **Data inputs**, and find `Adobe I/O Events`, the input you just added. **Click Add new on that row**.
2. Click **Add new** and fill in:
    * `name` Integration Name
    * `endpoint` Jouranling API Endpoint from console.adobe.io->Integration->Event Details->Journaling
    * `api_key` API KEY (Client ID) from console.adobe.io->Integration->Overview
    * `technical_account_id` Technical account ID from console.adobe.io->Integration->Overview
    * `org_id` Organization ID from console.adobe.io->Integration->Overview
    * `client_secret` Client Secret from console.adobe.io->Integration->Overview
    * `private_key` Private key for the public certificate used for creating integration in console.adobe.io
3. Click on "More Settings" and provide frequency of polling events in second(s).

4. Save your input, and navigate back to Splunk Home.
5. Do a search for `sourcetype=adobe_io_events` and you should see some events indexed, if your integration has a large number of events indexing them may take a few moments.

# Credits
- [splunk-sdk-javascript](https://github.com/splunk/splunk-sdk-javascript)
- Hiren Shah [@hirenoble](https://github.com/hirenoble)

# License
[MIT](LICENSE)
